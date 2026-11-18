using System;
using UnityEngine;
using UnityEngine.AI;
using ShipyardCat.Player;

namespace ShipyardCat.AI
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(NavMeshAgent))]
    public class LieutenantCobaltBossAI : MonoBehaviour
    {
        [Header("Target")]
        [SerializeField] private Transform albaTransform;
        [SerializeField] private string playerTag = "Player";

        [Header("Health & Aggro")]
        [SerializeField] private float maxHealth = 350f;
        [SerializeField] private float aggroRadius = 22f;
        [SerializeField] private float disengageRadius = 30f;
        [SerializeField] private float attackChaseStopDistance = 3.5f;

        [Header("Passive Radiation")]
        [SerializeField] private float passiveRadiationRadius = 8f;
        [SerializeField] private float passiveRadiationPerSecond = 3.5f;

        [Header("Periodic AoE Radiation Pulse")]
        [SerializeField] private float pulseInterval = 7f;
        [SerializeField] private float pulseTelegraphDuration = 1.5f;
        [SerializeField] private float pulseRadius = 10f;
        [SerializeField] private float pulseRadiationBurst = 25f;

        [Header("Warning Ring Visuals")]
        [SerializeField] private LineRenderer warningRing;
        [SerializeField, Range(16, 128)] private int ringSegments = 64;
        [SerializeField] private float ringYOffset = 0.08f;
        [SerializeField] private float ringWidth = 0.15f;
        [SerializeField] private Color telegraphStartColor = new Color(0.2f, 0.9f, 1f, 0.4f);
        [SerializeField] private Color telegraphEndColor = new Color(0.4f, 1f, 0.3f, 0.95f);

        public event Action<float, float, bool> OnBossStateChanged;

        public float CurrentHealth => currentHealth;
        public float MaxHealth => maxHealth;
        public bool IsAggro => isAggro;
        public bool IsDead => isDead;

        private NavMeshAgent agent;
        private float currentHealth;
        private bool isAggro;
        private bool isDead;

        private float pulseCooldownTimer;
        private float telegraphTimer;
        private bool isTelegraphingPulse;
        private Vector3[] ringPositions;

        private void Awake()
        {
            agent = GetComponent<NavMeshAgent>();
            agent.stoppingDistance = attackChaseStopDistance;

            currentHealth = maxHealth;
            pulseCooldownTimer = pulseInterval;

            InitializeWarningRing();
        }

        private void Start()
        {
            ResolveAlbaTarget();
            NotifyStateChanged();
        }

        private void Update()
        {
            if (isDead)
            {
                return;
            }

            if (albaTransform == null)
            {
                ResolveAlbaTarget();
                if (albaTransform == null)
                {
                    return;
                }
            }

            float dt = Time.deltaTime;
            float distanceToAlba = Vector3.Distance(transform.position, albaTransform.position);

            UpdateAggroState(distanceToAlba);
            UpdateMovement();
            UpdatePassiveRadiation(distanceToAlba, dt);
            UpdateRadiationPulse(distanceToAlba, dt);
        }

        public void TakeDamage(float amount)
        {
            if (isDead || amount <= 0f)
            {
                return;
            }

            currentHealth = Mathf.Max(0f, currentHealth - amount);

            if (!isAggro && currentHealth > 0f)
            {
                isAggro = true;
            }

            if (currentHealth <= 0f)
            {
                HandleDeath();
                return;
            }

            NotifyStateChanged();
        }

        private void ResolveAlbaTarget()
        {
            if (albaTransform != null)
            {
                return;
            }

            GameObject playerObj = GameObject.FindGameObjectWithTag(playerTag);
            if (playerObj != null)
            {
                albaTransform = playerObj.transform;
            }
        }

        private void UpdateAggroState(float distanceToAlba)
        {
            bool previousAggro = isAggro;

            if (!isAggro && distanceToAlba <= aggroRadius)
            {
                isAggro = true;
                pulseCooldownTimer = pulseInterval;
            }
            else if (isAggro && distanceToAlba > disengageRadius)
            {
                isAggro = false;
                CancelPulseTelegraph();
            }

            if (previousAggro != isAggro)
            {
                NotifyStateChanged();
            }
        }

        private void UpdateMovement()
        {
            if (agent == null || !agent.isOnNavMesh)
            {
                return;
            }

            if (isAggro && albaTransform != null)
            {
                agent.isStopped = false;
                agent.SetDestination(albaTransform.position);
            }
            else
            {
                agent.isStopped = true;
                if (agent.hasPath)
                {
                    agent.ResetPath();
                }
            }
        }

        private void UpdatePassiveRadiation(float distanceToAlba, float dt)
        {
            if (distanceToAlba <= passiveRadiationRadius && albaTransform != null)
            {
                var vitals = albaTransform.GetComponent<CatVitals>();
                if (vitals != null) vitals.AddRadiation(passiveRadiationPerSecond * dt);
            }
        }

        private void UpdateRadiationPulse(float distanceToAlba, float dt)
        {
            if (!isAggro)
            {
                return;
            }

            if (!isTelegraphingPulse)
            {
                pulseCooldownTimer -= dt;
                if (pulseCooldownTimer <= 0f)
                {
                    StartPulseTelegraph();
                }
            }
            else
            {
                telegraphTimer += dt;
                float progress = Mathf.Clamp01(telegraphTimer / Mathf.Max(0.01f, pulseTelegraphDuration));
                UpdateWarningRingVisual(progress);

                if (telegraphTimer >= pulseTelegraphDuration)
                {
                    ExecuteRadiationPulse(distanceToAlba);
                }
            }
        }

        private void StartPulseTelegraph()
        {
            isTelegraphingPulse = true;
            telegraphTimer = 0f;

            if (warningRing != null)
            {
                warningRing.enabled = true;
                UpdateWarningRingVisual(0f);
            }
        }

        private void ExecuteRadiationPulse(float distanceToAlba)
        {
            if (distanceToAlba <= pulseRadius && albaTransform != null)
            {
                var vitals = albaTransform.GetComponent<CatVitals>();
                if (vitals != null) vitals.AddRadiation(pulseRadiationBurst);
            }

            CancelPulseTelegraph();
            pulseCooldownTimer = pulseInterval;
        }

        private void CancelPulseTelegraph()
        {
            isTelegraphingPulse = false;
            telegraphTimer = 0f;

            if (warningRing != null)
            {
                warningRing.enabled = false;
            }
        }

        private void HandleDeath()
        {
            isDead = true;
            isAggro = false;
            CancelPulseTelegraph();

            if (agent != null && agent.isOnNavMesh)
            {
                agent.isStopped = true;
                agent.ResetPath();
            }

            NotifyStateChanged();
        }

        private void NotifyStateChanged()
        {
            OnBossStateChanged?.Invoke(currentHealth, maxHealth, isAggro);
        }

        private void InitializeWarningRing()
        {
            if (warningRing == null)
            {
                GameObject ringObject = new GameObject("RadiationWarningRing");
                ringObject.transform.SetParent(transform, false);
                warningRing = ringObject.AddComponent<LineRenderer>();

                Shader shader = Shader.Find("Universal Render Pipeline/Unlit");
                if (shader == null)
                {
                    shader = Shader.Find("Sprites/Default");
                }

                if (shader != null)
                {
                    warningRing.material = new Material(shader);
                }
            }

            warningRing.useWorldSpace = false;
            warningRing.loop = true;
            warningRing.positionCount = ringSegments;
            warningRing.startWidth = ringWidth;
            warningRing.endWidth = ringWidth;
            warningRing.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            warningRing.receiveShadows = false;
            warningRing.enabled = false;

            ringPositions = new Vector3[ringSegments];
        }

        private void UpdateWarningRingVisual(float progress)
        {
            if (warningRing == null)
            {
                return;
            }

            if (ringPositions == null || ringPositions.Length != ringSegments)
            {
                ringPositions = new Vector3[ringSegments];
                warningRing.positionCount = ringSegments;
            }

            float currentRadius = Mathf.Lerp(0.5f, pulseRadius, progress);
            float step = (Mathf.PI * 2f) / ringSegments;

            for (int i = 0; i < ringSegments; i++)
            {
                float angle = i * step;
                ringPositions[i] = new Vector3(
                    Mathf.Cos(angle) * currentRadius,
                    ringYOffset,
                    Mathf.Sin(angle) * currentRadius
                );
            }

            warningRing.SetPositions(ringPositions);

            Color ringColor = Color.Lerp(telegraphStartColor, telegraphEndColor, progress);
            warningRing.startColor = ringColor;
            warningRing.endColor = ringColor;
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.yellow;
            Gizmos.DrawWireSphere(transform.position, aggroRadius);

            Gizmos.color = Color.green;
            Gizmos.DrawWireSphere(transform.position, passiveRadiationRadius);

            Gizmos.color = Color.cyan;
            Gizmos.DrawWireSphere(transform.position, pulseRadius);
        }
    }
}
