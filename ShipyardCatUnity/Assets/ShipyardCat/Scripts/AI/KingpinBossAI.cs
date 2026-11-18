using System;
using System.Collections;
using System.Reflection;
using UnityEngine;
using UnityEngine.AI;
using ShipyardCat.Core;
using ShipyardCat.Player;

namespace ShipyardCat.AI
{
    /// <summary>
    /// Dry Dock 1 basin boss AI ("Kingpin").
    /// Remains dormant until Alba enters the Dry Dock 1 basin (y <= -0.5f and horizontal distance < 22m)
    /// or damages the boss directly. Leaving the basin disengages the boss and restores yard BGM.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(NavMeshAgent))]
    public class KingpinBossAI : MonoBehaviour, IDamageable
    {
        public static KingpinBossAI Instance { get; private set; }

        [Header("Vitality")]
        [SerializeField] private float maxHealth = 300f;

        [Header("Dry Dock 1 Basin Aggro Gate")]
        [SerializeField] private float basinEntryMaxY = -0.5f;
        [SerializeField] private float basinExitMaxY = -0.05f;
        [SerializeField] private float aggroHorizontalRadius = 22f;
        [SerializeField] private float disengageHorizontalRadius = 25f;
        [SerializeField] private float damageAggroGraceDuration = 3f;

        [Header("Movement & Combat")]
        [SerializeField] private float chaseSpeed = 5.4f;
        [SerializeField] private float returnSpeed = 4.0f;
        [SerializeField] private float attackRange = 3.1f;
        [SerializeField] private float attackDamage = 18f;
        [SerializeField] private float attackCooldown = 1.75f;
        [SerializeField] private float lungeDistance = 1.4f;
        [SerializeField] private float turnSpeed = 9f;

        public float Health { get; private set; } = 300f;
        public float MaxHealth => maxHealth;
        public bool IsAlive => Health > 0f;
        public bool IsAggro { get; private set; } = false;
        public bool IsBossEngaged => IsAggro;
        public Vector3 Position => transform.position;

        public event Action<float, float, bool> OnBossStateChanged;

        private NavMeshAgent agent;
        private Vector3 homePosition;
        private Transform playerTransform;
        private CatVitals playerVitals;

        private float lastAttackTime = -10f;
        private float damageGraceTimer = 0f;
        private float roarCooldownTimer = 0f;
        private float animTime = 0f;
        private bool victoryTriggered = false;

        private Transform visualRoot;
        private Transform tailPivot;
        private Renderer[] bossRenderers;
        private Material[] cachedMaterials;
        private Color[] originalColors;
        private Coroutine hitFlashCoroutine;
        private Coroutine lungeCoroutine;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;

            Health = maxHealth;
            homePosition = transform.position;

            EnsureCollider();
            ConfigureNavMeshAgent();
            EnsureProceduralVisuals();
        }

        private void Start()
        {
            ResolvePlayerReferences();
            OnBossStateChanged?.Invoke(Health, MaxHealth, IsAggro);
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        private void Update()
        {
            if (!IsAlive)
            {
                return;
            }

            if (playerTransform == null || playerVitals == null)
            {
                ResolvePlayerReferences();
            }

            if (damageGraceTimer > 0f)
            {
                damageGraceTimer -= Time.deltaTime;
            }

            if (roarCooldownTimer > 0f)
            {
                roarCooldownTimer -= Time.deltaTime;
            }

            EvaluateAggroGate();
            UpdateBehavior();
            UpdateVisualAnimation();
        }

        private void EnsureCollider()
        {
            if (GetComponent<Collider>() == null)
            {
                CapsuleCollider capsule = gameObject.AddComponent<CapsuleCollider>();
                capsule.center = new Vector3(0f, 1.05f, 0f);
                capsule.radius = 1.0f;
                capsule.height = 2.2f;
            }
        }

        private void ConfigureNavMeshAgent()
        {
            agent = GetComponent<NavMeshAgent>();
            if (agent != null)
            {
                agent.speed = chaseSpeed;
                agent.angularSpeed = 360f;
                agent.acceleration = 14f;
                agent.stoppingDistance = Mathf.Max(1.8f, attackRange * 0.72f);
                agent.radius = 1.0f;
                agent.height = 2.2f;
                agent.baseOffset = 0f;
                agent.updateRotation = false;
            }
        }

        private void ResolvePlayerReferences()
        {
            if (ShipyardGameManager.Instance != null)
            {
                if (playerTransform == null)
                {
                    playerTransform = ShipyardGameManager.Instance.PlayerTransform;
                }
                if (playerVitals == null)
                {
                    playerVitals = ShipyardGameManager.Instance.PlayerVitals;
                }
            }

            if (playerVitals == null)
            {
                playerVitals = FindAnyObjectByType<CatVitals>();
            }

            if (playerTransform == null && playerVitals != null)
            {
                playerTransform = playerVitals.transform;
            }
        }

        private void EvaluateAggroGate()
        {
            if (playerTransform == null || (playerVitals != null && playerVitals.IsFainted))
            {
                if (IsAggro)
                {
                    SetAggro(false);
                }
                return;
            }

            Vector3 playerPos = playerTransform.position;
            float horizDistFromBasin = HorizontalDistance(playerPos, homePosition);

            bool withinEntryGate = playerPos.y <= basinEntryMaxY && horizDistFromBasin < aggroHorizontalRadius;
            bool withinExitGate = playerPos.y <= basinExitMaxY && horizDistFromBasin < disengageHorizontalRadius;

            if (!IsAggro)
            {
                if (withinEntryGate)
                {
                    SetAggro(true);
                }
            }
            else
            {
                if (!withinExitGate && damageGraceTimer <= 0f)
                {
                    SetAggro(false);
                }
            }
        }

        private void SetAggro(bool engaged)
        {
            if (IsAggro == engaged)
            {
                return;
            }

            IsAggro = engaged;

            if (ShipyardAudioManager.Instance != null)
            {
                ShipyardAudioManager.Instance.TriggerBossBGM(engaged);
                if (engaged && roarCooldownTimer <= 0f)
                {
                    ShipyardAudioManager.Instance.PlaySFX("BossRoar", transform.position);
                    roarCooldownTimer = 3.5f;
                }
            }

            if (engaged)
            {
                ShipyardGameManager.Instance?.UpdateObjective("Defeat the Kingpin in Dry Dock 1!");
            }
            else
            {
                StopLunge();
            }

            OnBossStateChanged?.Invoke(Health, MaxHealth, IsAggro);
        }

        private void UpdateBehavior()
        {
            if (IsAggro && playerTransform != null)
            {
                Vector3 targetPos = playerTransform.position;
                float distanceToPlayer = HorizontalDistance(transform.position, targetPos);
                float verticalDelta = Mathf.Abs(transform.position.y - targetPos.y);

                if (distanceToPlayer <= attackRange && verticalDelta <= 2.5f)
                {
                    StopAgentMovement();
                    RotateToward(targetPos);

                    if (Time.time - lastAttackTime >= attackCooldown)
                    {
                        PerformAttack();
                    }
                }
                else
                {
                    MoveToward(targetPos, chaseSpeed);
                }
            }
            else
            {
                float distToHome = HorizontalDistance(transform.position, homePosition);
                if (distToHome > 0.6f)
                {
                    MoveToward(homePosition, returnSpeed);
                }
                else
                {
                    StopAgentMovement();
                }
            }
        }

        private void MoveToward(Vector3 target, float speed)
        {
            if (agent != null && agent.enabled && agent.isOnNavMesh)
            {
                agent.isStopped = false;
                agent.speed = speed;
                agent.SetDestination(target);

                Vector3 desiredDir = agent.desiredVelocity;
                desiredDir.y = 0f;
                if (desiredDir.sqrMagnitude > 0.01f)
                {
                    RotateTowardDirection(desiredDir.normalized);
                }
                else
                {
                    RotateToward(target);
                }
            }
            else
            {
                Vector3 toTarget = target - transform.position;
                toTarget.y = 0f;
                if (toTarget.sqrMagnitude > 0.01f)
                {
                    Vector3 dir = toTarget.normalized;
                    Vector3 nextPos = transform.position + dir * (speed * Time.deltaTime);
                    nextPos.y = homePosition.y;
                    transform.position = ClampToBasin(nextPos);
                    RotateTowardDirection(dir);
                }
            }
        }

        private void StopAgentMovement()
        {
            if (agent != null && agent.enabled && agent.isOnNavMesh && !agent.isStopped)
            {
                agent.isStopped = true;
                agent.ResetPath();
            }
        }

        private Vector3 ClampToBasin(Vector3 candidate)
        {
            Vector3 offset = candidate - homePosition;
            offset.y = 0f;
            float maxOffset = aggroHorizontalRadius - 1.5f;
            if (offset.magnitude > maxOffset)
            {
                offset = offset.normalized * maxOffset;
                candidate.x = homePosition.x + offset.x;
                candidate.z = homePosition.z + offset.z;
            }
            return candidate;
        }

        private void RotateToward(Vector3 worldPoint)
        {
            Vector3 dir = worldPoint - transform.position;
            dir.y = 0f;
            if (dir.sqrMagnitude > 0.001f)
            {
                RotateTowardDirection(dir.normalized);
            }
        }

        private void RotateTowardDirection(Vector3 flatDirection)
        {
            Quaternion targetRot = Quaternion.LookRotation(flatDirection, Vector3.up);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, turnSpeed * Time.deltaTime);
        }

        private void PerformAttack()
        {
            lastAttackTime = Time.time;

            if (ShipyardAudioManager.Instance != null)
            {
                ShipyardAudioManager.Instance.PlaySFX("BossRoar", transform.position);
            }

            StopLunge();
            lungeCoroutine = StartCoroutine(LungeAttackRoutine());
        }

        private IEnumerator LungeAttackRoutine()
        {
            Vector3 lungeDir = transform.forward;
            lungeDir.y = 0f;
            if (lungeDir.sqrMagnitude < 0.001f)
            {
                lungeDir = Vector3.forward;
            }
            lungeDir.Normalize();

            float elapsed = 0f;
            const float windupDuration = 0.14f;
            const float strikeDuration = 0.16f;

            while (elapsed < windupDuration)
            {
                elapsed += Time.deltaTime;
                if (visualRoot != null)
                {
                    visualRoot.localPosition = new Vector3(0f, 0f, -0.25f * (elapsed / windupDuration));
                }
                yield return null;
            }

            if (visualRoot != null)
            {
                visualRoot.localPosition = Vector3.zero;
            }

            Vector3 startPos = transform.position;
            Vector3 targetPos = ClampToBasin(startPos + lungeDir * lungeDistance);
            elapsed = 0f;

            while (elapsed < strikeDuration && IsAlive)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / strikeDuration);
                Vector3 stepPos = Vector3.Lerp(startPos, targetPos, t);

                if (agent != null && agent.enabled && agent.isOnNavMesh)
                {
                    agent.Move(stepPos - transform.position);
                }
                else
                {
                    stepPos.y = homePosition.y;
                    transform.position = stepPos;
                }

                yield return null;
            }

            if (IsAlive && playerTransform != null && playerVitals != null && !playerVitals.IsFainted)
            {
                float dist = HorizontalDistance(transform.position, playerTransform.position);
                float vertDist = Mathf.Abs(transform.position.y - playerTransform.position.y);
                if (dist <= attackRange + 0.8f && vertDist <= 2.5f)
                {
                    playerVitals.ModifyHealth(-attackDamage);
                    ShipyardAudioManager.Instance?.PlaySFX("Swipe", playerTransform.position);
                }
            }

            lungeCoroutine = null;
        }

        private void StopLunge()
        {
            if (lungeCoroutine != null)
            {
                StopCoroutine(lungeCoroutine);
                lungeCoroutine = null;
            }

            if (visualRoot != null)
            {
                visualRoot.localPosition = Vector3.zero;
            }
        }

        public void TakeDamage(float amount)
        {
            TakeDamage(amount, playerTransform != null ? playerTransform.position : transform.position - transform.forward);
        }

        public void TakeDamage(float amount, Vector3 hitSource)
        {
            if (!IsAlive || amount <= 0f)
            {
                return;
            }

            Health = Mathf.Max(0f, Health - amount);
            damageGraceTimer = damageAggroGraceDuration;

            if (!IsAggro && Health > 0f)
            {
                SetAggro(true);
            }

            TriggerHitFlash();

            if (Health <= 0f)
            {
                HandleDefeat();
            }
            else
            {
                ShipyardAudioManager.Instance?.PlaySFX("RatSqueak", transform.position);

                Vector3 knockDir = transform.position - hitSource;
                knockDir.y = 0f;
                if (knockDir.sqrMagnitude > 0.001f)
                {
                    Vector3 push = knockDir.normalized * 0.45f;
                    if (agent != null && agent.enabled && agent.isOnNavMesh)
                    {
                        agent.Move(push);
                    }
                    else
                    {
                        transform.position = ClampToBasin(transform.position + push);
                    }
                }

                OnBossStateChanged?.Invoke(Health, MaxHealth, IsAggro);
            }
        }

        private void HandleDefeat()
        {
            StopLunge();
            StopAgentMovement();

            if (agent != null)
            {
                agent.enabled = false;
            }

            Collider col = GetComponent<Collider>();
            if (col != null)
            {
                col.enabled = false;
            }

            IsAggro = false;
            OnBossStateChanged?.Invoke(Health, MaxHealth, IsAggro);

            ShipyardAudioManager.Instance?.TriggerBossBGM(false);
            ShipyardAudioManager.Instance?.PlaySFX("Victory", transform.position);

            if (!victoryTriggered)
            {
                victoryTriggered = true;

                if (playerVitals == null)
                {
                    ResolvePlayerReferences();
                }

                NotifyKingpinDefeated(playerVitals);
                ShipyardGameManager.Instance?.UpdateObjective("Kingpin Defeated! Dry Dock 1 Secured.");
            }

            StartCoroutine(DefeatCollapseRoutine());
        }

        private static void NotifyKingpinDefeated(CatVitals vitals)
        {
            if (vitals == null)
            {
                return;
            }

            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
            MethodInfo recordMethod = vitals.GetType().GetMethod("RecordKingpinDefeated", flags);
            if (recordMethod != null)
            {
                ParameterInfo[] parameters = recordMethod.GetParameters();
                if (parameters.Length == 0)
                {
                    recordMethod.Invoke(vitals, null);
                    return;
                }
                if (parameters.Length == 1 && parameters[0].ParameterType == typeof(int))
                {
                    recordMethod.Invoke(vitals, new object[] { 1000 });
                    return;
                }
            }

            MethodInfo victoryMethod = vitals.GetType().GetMethod("TriggerVictory", flags);
            if (victoryMethod != null)
            {
                ParameterInfo[] parameters = victoryMethod.GetParameters();
                if (parameters.Length == 0)
                {
                    victoryMethod.Invoke(vitals, null);
                }
                else if (parameters.Length == 1 && parameters[0].ParameterType == typeof(int))
                {
                    victoryMethod.Invoke(vitals, new object[] { 1000 });
                }
            }
        }

        private IEnumerator DefeatCollapseRoutine()
        {
            Quaternion startRot = transform.rotation;
            Quaternion endRot = startRot * Quaternion.Euler(0f, 0f, 88f);
            Vector3 startPos = transform.position;
            Vector3 endPos = startPos + new Vector3(0f, -0.35f, 0f);

            float elapsed = 0f;
            const float duration = 0.65f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                transform.rotation = Quaternion.Slerp(startRot, endRot, t);
                transform.position = Vector3.Lerp(startPos, endPos, t);
                yield return null;
            }
        }

        private void TriggerHitFlash()
        {
            if (cachedMaterials == null || cachedMaterials.Length == 0)
            {
                return;
            }

            if (hitFlashCoroutine != null)
            {
                StopCoroutine(hitFlashCoroutine);
            }
            hitFlashCoroutine = StartCoroutine(HitFlashRoutine());
        }

        private IEnumerator HitFlashRoutine()
        {
            Color flashColor = new Color(1f, 0.25f, 0.15f, 1f);
            for (int i = 0; i < cachedMaterials.Length; i++)
            {
                if (cachedMaterials[i] != null && cachedMaterials[i].HasProperty("_BaseColor"))
                {
                    cachedMaterials[i].SetColor("_BaseColor", flashColor);
                }
                else if (cachedMaterials[i] != null && cachedMaterials[i].HasProperty("_Color"))
                {
                    cachedMaterials[i].color = flashColor;
                }
            }

            yield return new WaitForSeconds(0.12f);

            for (int i = 0; i < cachedMaterials.Length; i++)
            {
                if (cachedMaterials[i] != null && cachedMaterials[i].HasProperty("_BaseColor"))
                {
                    cachedMaterials[i].SetColor("_BaseColor", originalColors[i]);
                }
                else if (cachedMaterials[i] != null && cachedMaterials[i].HasProperty("_Color"))
                {
                    cachedMaterials[i].color = originalColors[i];
                }
            }

            hitFlashCoroutine = null;
        }

        private void UpdateVisualAnimation()
        {
            if (visualRoot == null)
            {
                return;
            }

            float speedFactor = IsAggro ? 7.5f : 2.2f;
            animTime += Time.deltaTime * speedFactor;

            float bobAmp = IsAggro ? 0.06f : 0.025f;
            if (lungeCoroutine == null)
            {
                visualRoot.localPosition = new Vector3(0f, Mathf.Abs(Mathf.Sin(animTime)) * bobAmp, 0f);
            }

            if (tailPivot != null)
            {
                tailPivot.localRotation = Quaternion.Euler(14f, Mathf.Sin(animTime * 1.3f) * 18f, 0f);
            }
        }

        private void EnsureProceduralVisuals()
        {
            if (GetComponentInChildren<Renderer>() != null)
            {
                bossRenderers = GetComponentsInChildren<Renderer>();
                CacheRendererMaterials();
                return;
            }

            GameObject rootObj = new GameObject("KingpinVisual");
            rootObj.transform.SetParent(transform, false);
            visualRoot = rootObj.transform;

            Shader litShader = Shader.Find("Universal Render Pipeline/Lit");
            if (litShader == null)
            {
                litShader = Shader.Find("Standard");
            }

            Material furMat = CreateMat(litShader, new Color(0.24f, 0.21f, 0.20f, 1f));
            Material bellyMat = CreateMat(litShader, new Color(0.36f, 0.31f, 0.28f, 1f));
            Material collarMat = CreateMat(litShader, new Color(0.75f, 0.36f, 0.08f, 1f));
            Material eyeMat = CreateMat(litShader, new Color(0.95f, 0.12f, 0.08f, 1f), emissive: true);
            Material tailMat = CreateMat(litShader, new Color(0.54f, 0.38f, 0.38f, 1f));

            // Hunched torso aligned along +Z
            CreatePart("Torso", PrimitiveType.Capsule, visualRoot, new Vector3(0f, 0.95f, -0.05f),
                Quaternion.Euler(78f, 0f, 0f), new Vector3(1.25f, 1.35f, 1.15f), furMat);

            CreatePart("Belly", PrimitiveType.Sphere, visualRoot, new Vector3(0f, 0.68f, 0.05f),
                Quaternion.identity, new Vector3(1.1f, 0.85f, 1.55f), bellyMat);

            // Broad head & forward +Z snout
            CreatePart("Head", PrimitiveType.Sphere, visualRoot, new Vector3(0f, 1.25f, 1.05f),
                Quaternion.identity, new Vector3(0.92f, 0.82f, 1.05f), furMat);

            CreatePart("Snout", PrimitiveType.Capsule, visualRoot, new Vector3(0f, 1.12f, 1.58f),
                Quaternion.Euler(90f, 0f, 0f), new Vector3(0.48f, 0.55f, 0.44f), bellyMat);

            CreatePart("Nose", PrimitiveType.Sphere, visualRoot, new Vector3(0f, 1.14f, 1.98f),
                Quaternion.identity, new Vector3(0.18f, 0.16f, 0.18f), tailMat);

            // Ears
            CreatePart("EarLeft", PrimitiveType.Sphere, visualRoot, new Vector3(-0.38f, 1.66f, 0.88f),
                Quaternion.Euler(10f, 0f, 22f), new Vector3(0.32f, 0.38f, 0.12f), tailMat);
            CreatePart("EarRight", PrimitiveType.Sphere, visualRoot, new Vector3(0.38f, 1.66f, 0.88f),
                Quaternion.Euler(10f, 0f, -22f), new Vector3(0.32f, 0.38f, 0.12f), tailMat);

            // Glowing crimson eyes
            CreatePart("EyeLeft", PrimitiveType.Sphere, visualRoot, new Vector3(-0.24f, 1.38f, 1.46f),
                Quaternion.identity, new Vector3(0.14f, 0.14f, 0.14f), eyeMat);
            CreatePart("EyeRight", PrimitiveType.Sphere, visualRoot, new Vector3(0.24f, 1.38f, 1.46f),
                Quaternion.identity, new Vector3(0.14f, 0.14f, 0.14f), eyeMat);

            // Industrial hazard collar
            CreatePart("Collar", PrimitiveType.Cylinder, visualRoot, new Vector3(0f, 1.15f, 0.68f),
                Quaternion.Euler(70f, 0f, 0f), new Vector3(0.96f, 0.14f, 0.96f), collarMat);

            // Four sturdy limbs
            CreatePart("LegFL", PrimitiveType.Capsule, visualRoot, new Vector3(-0.48f, 0.38f, 0.65f),
                Quaternion.identity, new Vector3(0.32f, 0.42f, 0.32f), furMat);
            CreatePart("LegFR", PrimitiveType.Capsule, visualRoot, new Vector3(0.48f, 0.38f, 0.65f),
                Quaternion.identity, new Vector3(0.32f, 0.42f, 0.32f), furMat);
            CreatePart("LegBL", PrimitiveType.Capsule, visualRoot, new Vector3(-0.54f, 0.42f, -0.68f),
                Quaternion.identity, new Vector3(0.38f, 0.48f, 0.38f), furMat);
            CreatePart("LegBR", PrimitiveType.Capsule, visualRoot, new Vector3(0.54f, 0.42f, -0.68f),
                Quaternion.identity, new Vector3(0.38f, 0.48f, 0.38f), furMat);

            // Articulated tail extending -Z
            GameObject tailPivotObj = new GameObject("TailPivot");
            tailPivotObj.transform.SetParent(visualRoot, false);
            tailPivotObj.transform.localPosition = new Vector3(0f, 0.72f, -1.05f);
            tailPivot = tailPivotObj.transform;

            CreatePart("TailSegment", PrimitiveType.Capsule, tailPivot, new Vector3(0f, 0f, -0.95f),
                Quaternion.Euler(86f, 0f, 0f), new Vector3(0.18f, 1.05f, 0.18f), tailMat);

            bossRenderers = visualRoot.GetComponentsInChildren<Renderer>();
            CacheRendererMaterials();
        }

        private void CacheRendererMaterials()
        {
            if (bossRenderers == null || bossRenderers.Length == 0)
            {
                return;
            }

            cachedMaterials = new Material[bossRenderers.Length];
            originalColors = new Color[bossRenderers.Length];

            for (int i = 0; i < bossRenderers.Length; i++)
            {
                Material mat = bossRenderers[i].material;
                cachedMaterials[i] = mat;
                if (mat != null)
                {
                    if (mat.HasProperty("_BaseColor"))
                    {
                        originalColors[i] = mat.GetColor("_BaseColor");
                    }
                    else if (mat.HasProperty("_Color"))
                    {
                        originalColors[i] = mat.color;
                    }
                    else
                    {
                        originalColors[i] = Color.gray;
                    }
                }
            }
        }

        private static Material CreateMat(Shader shader, Color color, bool emissive = false)
        {
            Material mat = new Material(shader);
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", color);
            }
            else if (mat.HasProperty("_Color"))
            {
                mat.color = color;
            }

            if (emissive && mat.HasProperty("_EmissionColor"))
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", color * 2.5f);
            }

            return mat;
        }

        private static void CreatePart(string partName, PrimitiveType type, Transform parent,
            Vector3 localPos, Quaternion localRot, Vector3 localScale, Material mat)
        {
            GameObject part = GameObject.CreatePrimitive(type);
            part.name = partName;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPos;
            part.transform.localRotation = localRot;
            part.transform.localScale = localScale;

            Collider col = part.GetComponent<Collider>();
            if (col != null)
            {
                Destroy(col);
            }

            Renderer rend = part.GetComponent<Renderer>();
            if (rend != null && mat != null)
            {
                rend.sharedMaterial = mat;
            }
        }

        private static float HorizontalDistance(Vector3 a, Vector3 b)
        {
            float dx = a.x - b.x;
            float dz = a.z - b.z;
            return Mathf.Sqrt(dx * dx + dz * dz);
        }
    }
}
