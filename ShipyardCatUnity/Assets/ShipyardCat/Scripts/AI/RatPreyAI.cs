using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using ShipyardCat.Core;
using ShipyardCat.Player;

namespace ShipyardCat.AI
{
    /// <summary>
    /// Autonomous shipyard rat prey AI.
    /// Patrols shipyard waypoints on the NavMesh (with grounded fallback when off-NavMesh),
    /// flees from Alba within AlertRadius, aligns +Z snout strictly with movement velocity,
    /// supports Whiskers Sonar highlighting, and awards score to CatVitals when caught.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(NavMeshAgent))]
    public class RatPreyAI : MonoBehaviour, IDamageable
    {
        private enum RatState
        {
            Patrol,
            Flee,
            Caught
        }

        [Header("Vitals & Scoring")]
        [SerializeField] private float maxHealth = 25f;
        [SerializeField] private int scoreValue = 150;
        [SerializeField] private bool canRespawn = true;
        [SerializeField] private float respawnDelay = 20f;

        [Header("Navigation & Behavior")]
        [SerializeField] private float alertRadius = 8f;
        [SerializeField] private float safeDistanceMultiplier = 1.65f;
        [SerializeField] private float patrolRadius = 14f;
        [SerializeField] private float patrolSpeed = 2.6f;
        [SerializeField] private float fleeSpeed = 6.2f;
        [SerializeField] private float turnSpeedDeg = 720f;
        [SerializeField] private float waypointWaitMin = 0.8f;
        [SerializeField] private float waypointWaitMax = 2.2f;
        [SerializeField] private Transform[] patrolWaypoints;

        [Header("Sonar Highlight")]
        [SerializeField] private Color sonarHighlightColor = new Color(0.12f, 0.92f, 1.0f, 1f);
        [SerializeField] private float sonarEmissionIntensity = 2.2f;

        public bool IsAlive { get; private set; } = true;
        public Vector3 Position => transform.position;
        public float AlertRadius => alertRadius;

        private NavMeshAgent _agent;
        private Collider _hitCollider;
        private Transform _playerTransform;
        private Transform _tailTransform;

        private RatState _state = RatState.Patrol;
        private float _currentHealth;
        private Vector3 _spawnPosition;
        private Quaternion _spawnRotation;

        private Vector3 _currentTarget;
        private int _waypointIndex;
        private float _waitTimer;
        private float _fleeTimer;
        private float _fleeRecomputeTimer;
        private float _sonarTimer;
        private float _navMeshRetryTimer;
        private Vector3 _fallbackVelocity;

        private readonly List<Renderer> _renderers = new List<Renderer>();
        private readonly List<Material> _runtimeMaterials = new List<Material>();
        private readonly List<Color> _baseEmissionColors = new List<Color>();
        private readonly List<bool> _baseEmissionEnabled = new List<bool>();
        private bool _isSonarHighlighted;

        private Coroutine _respawnCoroutine;

        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");

        private void Awake()
        {
            _spawnPosition = transform.position;
            _spawnRotation = transform.rotation;
            _currentHealth = maxHealth;

            ConfigureCollider();
            ConfigureAgent();
            EnsureVisualHierarchy();
            CacheRendererMaterials();
        }

        private void Start()
        {
            ResolvePlayerReference();
            SnapToNavMeshIfPossible();
            ChooseNextPatrolDestination();
        }

        private void Update()
        {
            if (!IsAlive)
            {
                return;
            }

            float dt = Time.deltaTime;
            if (dt <= 0f)
            {
                return;
            }

            if (_playerTransform == null)
            {
                ResolvePlayerReference();
            }

            UpdateSonarHighlight(dt);
            TryRecoverNavMesh(dt);

            EvaluateThreat(dt);

            if (_state == RatState.Flee)
            {
                UpdateFlee(dt);
            }
            else if (_state == RatState.Patrol)
            {
                UpdatePatrol(dt);
            }

            AlignSnoutWithVelocity(dt);
            AnimateTail(dt);
        }

        private void OnDestroy()
        {
            for (int i = 0; i < _runtimeMaterials.Count; i++)
            {
                if (_runtimeMaterials[i] != null)
                {
                    Destroy(_runtimeMaterials[i]);
                }
            }
            _runtimeMaterials.Clear();
        }

        /// <summary>
        /// Overload supporting single-parameter damage calls while satisfying IDamageable.
        /// </summary>
        public void TakeDamage(float amount)
        {
            TakeDamage(amount, transform.position - transform.forward);
        }

        public void TakeDamage(float amount, Vector3 hitSource)
        {
            if (!IsAlive || amount <= 0f)
            {
                return;
            }

            _currentHealth -= amount;
            PlayRatSqueak();

            if (_currentHealth <= 0f)
            {
                HandleCaught();
                return;
            }

            // Survives hit: immediately bolt away from the attacker.
            _state = RatState.Flee;
            _fleeTimer = 3.5f;
            _fleeRecomputeTimer = 0f;
            SetMoveSpeed(fleeSpeed);
            SetFleeDestinationAwayFrom(hitSource);
        }

        public void HighlightSonar(float duration = 4f)
        {
            if (!IsAlive || duration <= 0f)
            {
                return;
            }

            _sonarTimer = Mathf.Max(_sonarTimer, duration);
            if (!_isSonarHighlighted)
            {
                _isSonarHighlighted = true;
            }
        }

        private void ConfigureCollider()
        {
            _hitCollider = GetComponent<Collider>();
            if (_hitCollider == null)
            {
                CapsuleCollider capsule = gameObject.AddComponent<CapsuleCollider>();
                capsule.direction = 2; // Z-axis aligned with rat body
                capsule.radius = 0.22f;
                capsule.height = 0.65f;
                capsule.center = new Vector3(0f, 0.16f, 0.04f);
                _hitCollider = capsule;
            }
        }

        private void ConfigureAgent()
        {
            _agent = GetComponent<NavMeshAgent>();
            if (_agent == null)
            {
                _agent = gameObject.AddComponent<NavMeshAgent>();
            }

            _agent.radius = 0.22f;
            _agent.height = 0.45f;
            _agent.baseOffset = 0f;
            _agent.speed = patrolSpeed;
            _agent.angularSpeed = turnSpeedDeg;
            _agent.acceleration = 18f;
            _agent.stoppingDistance = 0.25f;
            _agent.autoBraking = true;
            _agent.updateRotation = false; // Explicitly align +Z snout with velocity
        }

        private void EnsureVisualHierarchy()
        {
            if (GetComponentInChildren<Renderer>() != null)
            {
                Transform existingTail = transform.Find("RatVisual/Tail");
                if (existingTail != null)
                {
                    _tailTransform = existingTail;
                }
                return;
            }

            GameObject visualRoot = new GameObject("RatVisual");
            visualRoot.transform.SetParent(transform, false);

            Material furMat = CreateRatMaterial(new Color(0.36f, 0.34f, 0.33f, 1f), 0.15f);
            Material accentMat = CreateRatMaterial(new Color(0.76f, 0.50f, 0.50f, 1f), 0.25f);
            Material eyeMat = CreateRatMaterial(new Color(0.06f, 0.06f, 0.07f, 1f), 0.75f);

            // Body
            CreatePart("Body", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(0f, 0.13f, -0.02f), Quaternion.identity,
                new Vector3(0.24f, 0.19f, 0.44f), furMat);

            // Head & Snout oriented strictly along +Z
            CreatePart("Head", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(0f, 0.15f, 0.22f), Quaternion.identity,
                new Vector3(0.16f, 0.14f, 0.24f), furMat);

            CreatePart("Nose", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(0f, 0.14f, 0.34f), Quaternion.identity,
                new Vector3(0.055f, 0.05f, 0.06f), accentMat);

            // Ears
            CreatePart("EarL", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(-0.065f, 0.22f, 0.16f), Quaternion.Euler(15f, 0f, 20f),
                new Vector3(0.06f, 0.07f, 0.03f), accentMat);

            CreatePart("EarR", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(0.065f, 0.22f, 0.16f), Quaternion.Euler(15f, 0f, -20f),
                new Vector3(0.06f, 0.07f, 0.03f), accentMat);

            // Eyes
            CreatePart("EyeL", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(-0.055f, 0.18f, 0.27f), Quaternion.identity,
                new Vector3(0.03f, 0.03f, 0.03f), eyeMat);

            CreatePart("EyeR", PrimitiveType.Sphere, visualRoot.transform,
                new Vector3(0.055f, 0.18f, 0.27f), Quaternion.identity,
                new Vector3(0.03f, 0.03f, 0.03f), eyeMat);

            // Tail extending along -Z
            GameObject tailPivot = new GameObject("Tail");
            tailPivot.transform.SetParent(visualRoot.transform, false);
            tailPivot.transform.localPosition = new Vector3(0f, 0.11f, -0.20f);
            _tailTransform = tailPivot.transform;

            CreatePart("TailMesh", PrimitiveType.Capsule, _tailTransform,
                new Vector3(0f, 0.02f, -0.17f), Quaternion.Euler(82f, 0f, 0f),
                new Vector3(0.035f, 0.18f, 0.035f), accentMat);
        }

        private static GameObject CreatePart(
            string partName,
            PrimitiveType primitive,
            Transform parent,
            Vector3 localPos,
            Quaternion localRot,
            Vector3 localScale,
            Material material)
        {
            GameObject go = GameObject.CreatePrimitive(primitive);
            go.name = partName;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localRotation = localRot;
            go.transform.localScale = localScale;

            Collider col = go.GetComponent<Collider>();
            if (col != null)
            {
                Destroy(col);
            }

            Renderer rend = go.GetComponent<Renderer>();
            if (rend != null && material != null)
            {
                rend.sharedMaterial = material;
            }

            return go;
        }

        private static Material CreateRatMaterial(Color albedo, float smoothness)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            Material mat = new Material(shader);
            if (mat.HasProperty(BaseColorId))
            {
                mat.SetColor(BaseColorId, albedo);
            }
            if (mat.HasProperty(ColorId))
            {
                mat.SetColor(ColorId, albedo);
            }
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }
            return mat;
        }

        private void CacheRendererMaterials()
        {
            _renderers.Clear();
            _runtimeMaterials.Clear();
            _baseEmissionColors.Clear();
            _baseEmissionEnabled.Clear();

            GetComponentsInChildren(true, _renderers);
            for (int i = 0; i < _renderers.Count; i++)
            {
                Renderer r = _renderers[i];
                if (r == null)
                {
                    continue;
                }

                // Material getter instantiates a safe per-instance copy
                Material mat = r.material;
                _runtimeMaterials.Add(mat);

                bool hadEmission = mat.IsKeywordEnabled("_EMISSION");
                Color baseEmission = mat.HasProperty(EmissionColorId) ? mat.GetColor(EmissionColorId) : Color.black;

                _baseEmissionEnabled.Add(hadEmission);
                _baseEmissionColors.Add(baseEmission);
            }
        }

        private void ResolvePlayerReference()
        {
            if (ShipyardGameManager.Instance != null && ShipyardGameManager.Instance.PlayerTransform != null)
            {
                _playerTransform = ShipyardGameManager.Instance.PlayerTransform;
                return;
            }

            CatVitals vitals = FindAnyObjectByType<CatVitals>();
            if (vitals != null)
            {
                _playerTransform = vitals.transform;
            }
        }

        private void SnapToNavMeshIfPossible()
        {
            if (_agent == null)
            {
                return;
            }

            if (NavMesh.SamplePosition(transform.position, out NavMeshHit hit, 4f, NavMesh.AllAreas))
            {
                _agent.enabled = true;
                _agent.Warp(hit.position);
            }
            else
            {
                _agent.enabled = false;
            }
        }

        private void TryRecoverNavMesh(float dt)
        {
            if (_agent == null || (_agent.enabled && _agent.isOnNavMesh))
            {
                return;
            }

            _navMeshRetryTimer -= dt;
            if (_navMeshRetryTimer > 0f)
            {
                return;
            }

            _navMeshRetryTimer = 1.5f;
            if (NavMesh.SamplePosition(transform.position, out NavMeshHit hit, 2.5f, NavMesh.AllAreas))
            {
                _agent.enabled = true;
                _agent.Warp(hit.position);
                SetMoveSpeed(_state == RatState.Flee ? fleeSpeed : patrolSpeed);
                if (_state == RatState.Patrol)
                {
                    SetAgentDestination(_currentTarget);
                }
            }
        }

        private void EvaluateThreat(float dt)
        {
            if (_playerTransform == null)
            {
                return;
            }

            Vector3 toRat = transform.position - _playerTransform.position;
            toRat.y = 0f;
            float distSq = toRat.sqrMagnitude;
            float alertDistSq = alertRadius * alertRadius;

            if (distSq <= alertDistSq)
            {
                if (_state != RatState.Flee)
                {
                    _state = RatState.Flee;
                    _fleeRecomputeTimer = 0f;
                    SetMoveSpeed(fleeSpeed);
                    PlayRatSqueak();
                }
                _fleeTimer = 2.0f;
            }
            else if (_state == RatState.Flee)
            {
                _fleeTimer -= dt;
                float safeDist = alertRadius * safeDistanceMultiplier;
                if (_fleeTimer <= 0f && distSq >= safeDist * safeDist)
                {
                    _state = RatState.Patrol;
                    SetMoveSpeed(patrolSpeed);
                    ChooseNextPatrolDestination();
                }
            }
        }

        private void UpdatePatrol(float dt)
        {
            if (_waitTimer > 0f)
            {
                _waitTimer -= dt;
                _fallbackVelocity = Vector3.zero;
                if (_waitTimer <= 0f)
                {
                    ChooseNextPatrolDestination();
                }
                return;
            }

            if (IsAgentReady())
            {
                if (!_agent.pathPending && _agent.remainingDistance <= _agent.stoppingDistance + 0.15f)
                {
                    _waitTimer = Random.Range(waypointWaitMin, waypointWaitMax);
                }
            }
            else
            {
                MoveFallbackToward(_currentTarget, patrolSpeed, dt);
                Vector3 flatDelta = _currentTarget - transform.position;
                flatDelta.y = 0f;
                if (flatDelta.sqrMagnitude <= 0.35f)
                {
                    _waitTimer = Random.Range(waypointWaitMin, waypointWaitMax);
                }
            }
        }

        private void UpdateFlee(float dt)
        {
            _fleeRecomputeTimer -= dt;
            if (_fleeRecomputeTimer <= 0f)
            {
                _fleeRecomputeTimer = 0.35f;
                Vector3 threatPos = _playerTransform != null
                    ? _playerTransform.position
                    : transform.position - transform.forward;
                SetFleeDestinationAwayFrom(threatPos);
            }

            if (!IsAgentReady())
            {
                MoveFallbackToward(_currentTarget, fleeSpeed, dt);
            }
        }

        private void ChooseNextPatrolDestination()
        {
            if (patrolWaypoints != null && patrolWaypoints.Length > 0)
            {
                Transform wp = patrolWaypoints[_waypointIndex % patrolWaypoints.Length];
                _waypointIndex = (_waypointIndex + 1) % patrolWaypoints.Length;
                if (wp != null)
                {
                    SetDestinationWithSample(wp.position, 4f);
                    return;
                }
            }

            for (int attempt = 0; attempt < 6; attempt++)
            {
                Vector2 offset = Random.insideUnitCircle * patrolRadius;
                Vector3 candidate = _spawnPosition + new Vector3(offset.x, 0f, offset.y);
                if (NavMesh.SamplePosition(candidate, out NavMeshHit hit, 4f, NavMesh.AllAreas))
                {
                    _currentTarget = hit.position;
                    SetAgentDestination(_currentTarget);
                    return;
                }
            }

            Vector2 fallbackOffset = Random.insideUnitCircle * (patrolRadius * 0.6f);
            _currentTarget = _spawnPosition + new Vector3(fallbackOffset.x, 0f, fallbackOffset.y);
            SetAgentDestination(_currentTarget);
        }

        private void SetFleeDestinationAwayFrom(Vector3 threatPosition)
        {
            Vector3 away = transform.position - threatPosition;
            away.y = 0f;
            if (away.sqrMagnitude < 0.001f)
            {
                away = transform.forward;
            }
            away.Normalize();

            // Try primary escape vector, then angled escape vectors if blocked by dry dock walls
            float[] angles = { 0f, 35f, -35f, 70f, -70f, 110f, -110f };
            for (int i = 0; i < angles.Length; i++)
            {
                Vector3 dir = Quaternion.Euler(0f, angles[i], 0f) * away;
                Vector3 candidate = transform.position + dir * 10f;

                if (NavMesh.SamplePosition(candidate, out NavMeshHit hit, 4.5f, NavMesh.AllAreas))
                {
                    _currentTarget = hit.position;
                    SetAgentDestination(_currentTarget);
                    return;
                }
            }

            _currentTarget = transform.position + away * 8f;
            SetAgentDestination(_currentTarget);
        }

        private void SetDestinationWithSample(Vector3 target, float sampleRadius)
        {
            if (NavMesh.SamplePosition(target, out NavMeshHit hit, sampleRadius, NavMesh.AllAreas))
            {
                _currentTarget = hit.position;
            }
            else
            {
                _currentTarget = target;
            }

            SetAgentDestination(_currentTarget);
        }

        private void SetAgentDestination(Vector3 destination)
        {
            if (IsAgentReady())
            {
                _agent.SetDestination(destination);
            }
        }

        private void SetMoveSpeed(float speed)
        {
            if (_agent != null)
            {
                _agent.speed = speed;
            }
        }

        private bool IsAgentReady()
        {
            return _agent != null && _agent.enabled && _agent.isOnNavMesh;
        }

        private void MoveFallbackToward(Vector3 target, float speed, float dt)
        {
            Vector3 dir = target - transform.position;
            dir.y = 0f;
            float dist = dir.magnitude;
            if (dist < 0.05f)
            {
                _fallbackVelocity = Vector3.zero;
                return;
            }

            Vector3 stepDir = dir / dist;
            _fallbackVelocity = stepDir * speed;
            Vector3 nextPos = transform.position + _fallbackVelocity * dt;

            // Keep grounded via downward raycast when operating off-NavMesh
            Vector3 rayOrigin = new Vector3(nextPos.x, transform.position.y + 1.5f, nextPos.z);
            if (Physics.Raycast(rayOrigin, Vector3.down, out RaycastHit groundHit, 5f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore))
            {
                nextPos.y = groundHit.point.y;
            }

            transform.position = nextPos;
        }

        private void AlignSnoutWithVelocity(float dt)
        {
            Vector3 vel = IsAgentReady() ? _agent.velocity : _fallbackVelocity;
            Vector3 flatVel = new Vector3(vel.x, 0f, vel.z);

            if (flatVel.sqrMagnitude > 0.04f)
            {
                Quaternion targetRot = Quaternion.LookRotation(flatVel.normalized, Vector3.up);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, targetRot, turnSpeedDeg * dt);
            }
        }

        private void AnimateTail(float dt)
        {
            if (_tailTransform == null)
            {
                return;
            }

            float speedFactor = IsAgentReady() ? _agent.velocity.magnitude : _fallbackVelocity.magnitude;
            float wagFreq = 5f + speedFactor * 3f;
            float wagAngle = Mathf.Sin(Time.time * wagFreq) * (8f + speedFactor * 2.5f);
            _tailTransform.localRotation = Quaternion.Slerp(
                _tailTransform.localRotation,
                Quaternion.Euler(0f, wagAngle, 0f),
                12f * dt);
        }

        private void UpdateSonarHighlight(float dt)
        {
            if (!_isSonarHighlighted)
            {
                return;
            }

            _sonarTimer -= dt;
            if (_sonarTimer <= 0f)
            {
                ClearSonarHighlight();
                return;
            }

            float pulse = 0.65f + 0.35f * Mathf.Sin(Time.time * 8f);
            Color glow = sonarHighlightColor * (sonarEmissionIntensity * pulse);

            for (int i = 0; i < _runtimeMaterials.Count; i++)
            {
                Material mat = _runtimeMaterials[i];
                if (mat == null)
                {
                    continue;
                }

                mat.EnableKeyword("_EMISSION");
                if (mat.HasProperty(EmissionColorId))
                {
                    mat.SetColor(EmissionColorId, glow);
                }
            }
        }

        private void ClearSonarHighlight()
        {
            _isSonarHighlighted = false;
            _sonarTimer = 0f;

            for (int i = 0; i < _runtimeMaterials.Count; i++)
            {
                Material mat = _runtimeMaterials[i];
                if (mat == null)
                {
                    continue;
                }

                if (_baseEmissionEnabled[i])
                {
                    mat.EnableKeyword("_EMISSION");
                }
                else
                {
                    mat.DisableKeyword("_EMISSION");
                }

                if (mat.HasProperty(EmissionColorId))
                {
                    mat.SetColor(EmissionColorId, _baseEmissionColors[i]);
                }
            }
        }

        private void HandleCaught()
        {
            IsAlive = false;
            _state = RatState.Caught;
            ClearSonarHighlight();

            CatVitals vitals = ShipyardGameManager.Instance != null
                ? ShipyardGameManager.Instance.PlayerVitals
                : null;

            if (vitals == null)
            {
                vitals = FindAnyObjectByType<CatVitals>();
            }

            if (vitals != null)
            {
                vitals.RegisterRatCaught(scoreValue);
            }

            SetRatActiveState(false);

            if (canRespawn && gameObject.activeInHierarchy)
            {
                if (_respawnCoroutine != null)
                {
                    StopCoroutine(_respawnCoroutine);
                }
                _respawnCoroutine = StartCoroutine(RespawnAfterDelay());
            }
        }

        private IEnumerator RespawnAfterDelay()
        {
            yield return new WaitForSeconds(respawnDelay);

            transform.SetPositionAndRotation(_spawnPosition, _spawnRotation);
            _currentHealth = maxHealth;
            IsAlive = true;
            _state = RatState.Patrol;
            _waitTimer = 0f;
            _fleeTimer = 0f;

            SetRatActiveState(true);
            SnapToNavMeshIfPossible();
            SetMoveSpeed(patrolSpeed);
            ChooseNextPatrolDestination();

            _respawnCoroutine = null;
        }

        private void SetRatActiveState(bool active)
        {
            if (_hitCollider != null)
            {
                _hitCollider.enabled = active;
            }

            if (_agent != null)
            {
                if (!active && _agent.enabled && _agent.isOnNavMesh)
                {
                    _agent.ResetPath();
                }
                _agent.enabled = active;
            }

            for (int i = 0; i < _renderers.Count; i++)
            {
                if (_renderers[i] != null)
                {
                    _renderers[i].enabled = active;
                }
            }
        }

        private void PlayRatSqueak()
        {
            if (ShipyardAudioManager.Instance != null)
            {
                ShipyardAudioManager.Instance.PlaySFX("RatSqueak", transform.position);
            }
        }
    }
}
