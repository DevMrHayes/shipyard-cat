using System;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Events;
using ShipyardCat.Player;

namespace ShipyardCat.AI
{
    public enum MutantVariant
    {
        Scout,
        Prowler,
        Enforcer
    }

    [RequireComponent(typeof(NavMeshAgent))]
    public class MutantCatAI : MonoBehaviour
    {
        public enum AIState
        {
            Patrol,
            Chase,
            Attack,
            Defeated
        }

        [Header("Variant & Base Stats")]
        [SerializeField] private MutantVariant variant = MutantVariant.Prowler;
        [SerializeField] private float baseMaxHealth = 100f;
        [SerializeField] private float basePatrolSpeed = 2.5f;
        [SerializeField] private float baseChaseSpeed = 5.0f;
        [SerializeField] private float baseAttackDamage = 15f;

        [Header("Detection & Combat")]
        [SerializeField] private float detectionRange = 12f;
        [SerializeField] private float loseTargetRange = 18f;
        [SerializeField] private float attackRange = 1.8f;
        [SerializeField] private float attackCooldown = 1.25f;
        [SerializeField] private float turnSpeed = 10f;
        [SerializeField] private bool requireLineOfSight = false;
        [SerializeField] private LayerMask lineOfSightBlockers = ~0;

        [Header("Patrol Settings")]
        [SerializeField] private Transform[] patrolWaypoints;
        [SerializeField] private float patrolRadius = 10f;
        [SerializeField] private float patrolWaitTime = 2f;
        [SerializeField] private float waypointTolerance = 0.6f;
        [SerializeField] private float pathUpdateInterval = 0.2f;

        [Header("Events")]
        [SerializeField] private UnityEvent<float> onDamaged;
        [SerializeField] private UnityEvent onAttack;
        [SerializeField] private UnityEvent onDefeated;

        private NavMeshAgent _agent;
        private AlbaController _target;

        private AIState _currentState = AIState.Patrol;
        private float _maxHealth;
        private float _currentHealth;
        private float _patrolSpeed;
        private float _chaseSpeed;
        private float _attackDamage;

        private int _currentWaypointIndex;
        private float _patrolWaitTimer;
        private float _attackTimer;
        private float _pathUpdateTimer;
        private Vector3 _spawnPosition;
        private bool _hasWanderTarget;
        private Vector3 _wanderTarget;

        public MutantVariant Variant => variant;
        public AIState CurrentState => _currentState;
        public float CurrentHealth => _currentHealth;
        public float MaxHealth => _maxHealth;
        public bool IsDefeated => _currentState == AIState.Defeated || _currentHealth <= 0f;

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
            _spawnPosition = transform.position;
            ApplyVariantScaling();
        }

        private void Start()
        {
            AcquireTarget();
            EnterState(AIState.Patrol);
        }

        private void Update()
        {
            if (IsDefeated)
            {
                return;
            }

            if (_target == null)
            {
                AcquireTarget();
            }

            if (_attackTimer > 0f)
            {
                _attackTimer -= Time.deltaTime;
            }

            switch (_currentState)
            {
                case AIState.Patrol:
                    UpdatePatrol();
                    break;
                case AIState.Chase:
                    UpdateChase();
                    break;
                case AIState.Attack:
                    UpdateAttack();
                    break;
            }
        }

        public void TakeDamage(float amount)
        {
            if (IsDefeated || amount <= 0f)
            {
                return;
            }

            _currentHealth = Mathf.Max(0f, _currentHealth - amount);
            onDamaged?.Invoke(amount);

            if (_currentHealth <= 0f)
            {
                HandleDefeat();
                return;
            }

            if (_currentState == AIState.Patrol && _target != null)
            {
                EnterState(AIState.Chase);
            }
        }

        public void SetVariant(MutantVariant newVariant, bool resetHealth = true)
        {
            variant = newVariant;
            ApplyVariantScaling(resetHealth);

            if (_agent != null && _agent.enabled)
            {
                _agent.speed = _currentState == AIState.Chase ? _chaseSpeed : _patrolSpeed;
            }
        }

        private void ApplyVariantScaling(bool resetHealth = true)
        {
            float healthMult;
            float speedMult;
            float damageMult;

            switch (variant)
            {
                case MutantVariant.Scout:
                    healthMult = 0.7f;
                    speedMult = 1.35f;
                    damageMult = 0.75f;
                    break;
                case MutantVariant.Enforcer:
                    healthMult = 1.85f;
                    speedMult = 0.8f;
                    damageMult = 1.6f;
                    break;
                case MutantVariant.Prowler:
                default:
                    healthMult = 1.0f;
                    speedMult = 1.05f;
                    damageMult = 1.0f;
                    break;
            }

            float previousMax = _maxHealth;
            _maxHealth = Mathf.Max(1f, baseMaxHealth * healthMult);
            _patrolSpeed = Mathf.Max(0.1f, basePatrolSpeed * speedMult);
            _chaseSpeed = Mathf.Max(_patrolSpeed, baseChaseSpeed * speedMult);
            _attackDamage = Mathf.Max(0f, baseAttackDamage * damageMult);

            if (resetHealth || previousMax <= 0f)
            {
                _currentHealth = _maxHealth;
            }
            else
            {
                float ratio = Mathf.Clamp01(_currentHealth / previousMax);
                _currentHealth = _maxHealth * ratio;
            }
        }

        private void AcquireTarget()
        {
            _target = FindAnyObjectByType<AlbaController>();
        }

        private void EnterState(AIState newState)
        {
            if (IsDefeated && newState != AIState.Defeated)
            {
                return;
            }

            _currentState = newState;

            if (_agent == null || !_agent.enabled || !_agent.isOnNavMesh)
            {
                return;
            }

            switch (newState)
            {
                case AIState.Patrol:
                    _agent.isStopped = false;
                    _agent.speed = _patrolSpeed;
                    _patrolWaitTimer = 0f;
                    _hasWanderTarget = false;
                    MoveToNextPatrolPoint();
                    break;

                case AIState.Chase:
                    _agent.isStopped = false;
                    _agent.speed = _chaseSpeed;
                    _pathUpdateTimer = 0f;
                    break;

                case AIState.Attack:
                    _agent.isStopped = true;
                    _agent.ResetPath();
                    break;

                case AIState.Defeated:
                    _agent.isStopped = true;
                    _agent.ResetPath();
                    _agent.enabled = false;
                    break;
            }
        }

        private void UpdatePatrol()
        {
            if (CanDetectTarget())
            {
                EnterState(AIState.Chase);
                return;
            }

            if (!_agent.enabled || !_agent.isOnNavMesh)
            {
                return;
            }

            if (!_agent.pathPending && _agent.remainingDistance <= waypointTolerance)
            {
                _patrolWaitTimer += Time.deltaTime;
                if (_patrolWaitTimer >= patrolWaitTime)
                {
                    _patrolWaitTimer = 0f;
                    MoveToNextPatrolPoint();
                }
            }
        }

        private void UpdateChase()
        {
            if (_target == null)
            {
                EnterState(AIState.Patrol);
                return;
            }

            float distance = Vector3.Distance(transform.position, _target.transform.position);

            if (distance > loseTargetRange)
            {
                EnterState(AIState.Patrol);
                return;
            }

            if (distance <= attackRange && HasLineOfSight(_target.transform))
            {
                EnterState(AIState.Attack);
                return;
            }

            _pathUpdateTimer -= Time.deltaTime;
            if (_pathUpdateTimer <= 0f && _agent.enabled && _agent.isOnNavMesh)
            {
                _pathUpdateTimer = pathUpdateInterval;
                _agent.SetDestination(_target.transform.position);
            }
        }

        private void UpdateAttack()
        {
            if (_target == null)
            {
                EnterState(AIState.Patrol);
                return;
            }

            float distance = Vector3.Distance(transform.position, _target.transform.position);
            if (distance > attackRange * 1.15f)
            {
                EnterState(AIState.Chase);
                return;
            }

            FaceTarget(_target.transform.position);

            if (_attackTimer <= 0f)
            {
                PerformAttack();
                _attackTimer = attackCooldown;
            }
        }

        private void PerformAttack()
        {
            if (_target == null || IsDefeated)
            {
                return;
            }

            _target.SendMessage("TakeDamage", _attackDamage, SendMessageOptions.DontRequireReceiver);
            onAttack?.Invoke();
        }

        private void HandleDefeat()
        {
            EnterState(AIState.Defeated);

            Collider[] colliders = GetComponents<Collider>();
            for (int i = 0; i < colliders.Length; i++)
            {
                colliders[i].enabled = false;
            }

            onDefeated?.Invoke();
        }

        private void MoveToNextPatrolPoint()
        {
            if (!_agent.enabled || !_agent.isOnNavMesh)
            {
                return;
            }

            if (patrolWaypoints != null && patrolWaypoints.Length > 0)
            {
                Transform waypoint = patrolWaypoints[_currentWaypointIndex];
                _currentWaypointIndex = (_currentWaypointIndex + 1) % patrolWaypoints.Length;

                if (waypoint != null)
                {
                    _agent.SetDestination(waypoint.position);
                    return;
                }
            }

            if (TryGetRandomNavMeshPoint(_spawnPosition, patrolRadius, out Vector3 randomPoint))
            {
                _wanderTarget = randomPoint;
                _hasWanderTarget = true;
                _agent.SetDestination(_wanderTarget);
            }
            else if (_hasWanderTarget)
            {
                _agent.SetDestination(_wanderTarget);
            }
        }

        private bool TryGetRandomNavMeshPoint(Vector3 center, float radius, out Vector3 result)
        {
            for (int i = 0; i < 6; i++)
            {
                Vector3 randomOffset = UnityEngine.Random.insideUnitSphere * radius;
                randomOffset.y = 0f;
                Vector3 candidate = center + randomOffset;

                if (NavMesh.SamplePosition(candidate, out NavMeshHit hit, 2.5f, NavMesh.AllAreas))
                {
                    result = hit.position;
                    return true;
                }
            }

            result = center;
            return false;
        }

        private bool CanDetectTarget()
        {
            if (_target == null)
            {
                return false;
            }

            float sqrDistance = (_target.transform.position - transform.position).sqrMagnitude;
            if (sqrDistance > detectionRange * detectionRange)
            {
                return false;
            }

            return HasLineOfSight(_target.transform);
        }

        private bool HasLineOfSight(Transform targetTransform)
        {
            if (!requireLineOfSight)
            {
                return true;
            }

            Vector3 origin = transform.position + Vector3.up * 0.5f;
            Vector3 destination = targetTransform.position + Vector3.up * 0.5f;
            Vector3 direction = destination - origin;
            float distance = direction.magnitude;

            if (distance <= Mathf.Epsilon)
            {
                return true;
            }

            if (Physics.Raycast(origin, direction / distance, out RaycastHit hit, distance, lineOfSightBlockers, QueryTriggerInteraction.Ignore))
            {
                return hit.transform == targetTransform || hit.transform.IsChildOf(targetTransform);
            }

            return true;
        }

        private void FaceTarget(Vector3 targetPosition)
        {
            Vector3 direction = targetPosition - transform.position;
            direction.y = 0f;

            if (direction.sqrMagnitude <= 0.0001f)
            {
                return;
            }

            Quaternion targetRotation = Quaternion.LookRotation(direction);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, turnSpeed * Time.deltaTime);
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(transform.position, detectionRange);

            Gizmos.color = Color.red;
            Gizmos.DrawWireSphere(transform.position, attackRange);

            Gizmos.color = Color.cyan;
            Vector3 patrolOrigin = Application.isPlaying ? _spawnPosition : transform.position;
            Gizmos.DrawWireSphere(patrolOrigin, patrolRadius);
        }
    }
}
