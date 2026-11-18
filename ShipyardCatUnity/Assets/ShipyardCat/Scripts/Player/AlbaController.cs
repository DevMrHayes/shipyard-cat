using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.InputSystem;
using ShipyardCat.AI;
using ShipyardCat.Core;
using ShipyardCat.World;

namespace ShipyardCat.Player
{
    [RequireComponent(typeof(CharacterController))]
    [RequireComponent(typeof(CatVitals))]
    public class AlbaController : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField] private float walkSpeed = 6.2f;
        [SerializeField] private float sprintSpeed = 10.5f;
        [SerializeField] private float rotationSpeed = 14f;
        [SerializeField] private float jumpHeight = 1.8f;
        [SerializeField] private float gravity = -22f;
        [SerializeField] private float sprintStaminaCostPerSec = 18f;
        [SerializeField] private float staminaRegenPerSec = 14f;

        [Header("Combat & Abilities")]
        [SerializeField] private float swipeRadius = 2.6f;
        [SerializeField] private float swipeDamage = 35f;
        [SerializeField] private float swipeCooldown = 0.35f;
        [SerializeField] private float pounceSpeed = 16.5f;
        [SerializeField] private float pounceDuration = 0.28f;
        [SerializeField] private float pounceDamage = 55f;
        [SerializeField] private float pounceCooldown = 0.85f;
        [SerializeField] private float pounceStaminaCost = 20f;
        [SerializeField] private float sonarRadius = 45f;
        [SerializeField] private float sonarHighlightDuration = 4f;

        public CatVitals Vitals { get; private set; }
        public bool IsSonarActive { get; private set; }

        public event Action OnWhiskersSonarPulse;
        public event Action OnToggleNightShiftRequested;
        public event Action OnToggleProtocolHUDRequested;

        private CharacterController _characterController;
        private float _verticalVelocity;
        private float _swipeCooldownTimer;
        private float _pounceCooldownTimer;
        private float _pounceTimer;
        private float _swipeAnimTimer;
        private float _walkCycleTime;
        private Vector3 _pounceDirection;
        private Vector3 _currentHorizontalVelocity;
        private readonly HashSet<IDamageable> _pounceHitTargets = new HashSet<IDamageable>();

        // Procedural cat visual references
        private Transform _visualRoot;
        private Transform _tailPivot;
        private Transform _frontLeftLeg;
        private Transform _frontRightLeg;
        private Transform _backLeftLeg;
        private Transform _backRightLeg;
        private Transform _headPivot;

        private void Awake()
        {
            _characterController = GetComponent<CharacterController>();
            Vitals = GetComponent<CatVitals>();

            ConfigureCharacterController();
            EnsureProceduralCatVisuals();
        }

        private void Start()
        {
            ShipyardGameManager gameManager = ShipyardGameManager.Instance != null
                ? ShipyardGameManager.Instance
                : FindAnyObjectByType<ShipyardGameManager>();

            if (gameManager != null)
            {
                gameManager.RegisterPlayer(transform, Vitals);
            }

            AlbaCameraRig cameraRig = FindAnyObjectByType<AlbaCameraRig>();
            if (cameraRig != null)
            {
                cameraRig.SetTarget(transform);
            }
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            UpdateCooldowns(dt);

            Keyboard keyboard = Keyboard.current;
            if (keyboard != null)
            {
                if (keyboard.f1Key.wasPressedThisFrame)
                {
                    OnToggleProtocolHUDRequested?.Invoke();
                }

                if (keyboard.nKey.wasPressedThisFrame)
                {
                    ToggleNightShift();
                }
            }

            if (Vitals != null && (Vitals.IsFainted || Vitals.IsVictorious))
            {
                ApplyIdleGravity(dt);
                UpdateProceduralAnimation(0f, dt);
                return;
            }

            HandleActionInputs(keyboard);
            HandleMovement(keyboard, dt);
            UpdateProceduralAnimation(_currentHorizontalVelocity.magnitude, dt);
        }

        public void PerformPawSwipe()
        {
            if (_swipeCooldownTimer > 0f)
            {
                return;
            }

            _swipeCooldownTimer = swipeCooldown;
            _swipeAnimTimer = 0.22f;

            ShipyardAudioManager.Instance?.PlaySFX("Swipe", transform.position);

            Vector3 swipeOrigin = transform.position + transform.forward * 0.75f + Vector3.up * 0.35f;
            int hitCount = ApplyMeleeDamageInSphere(swipeOrigin, swipeRadius, swipeDamage, requireForwardCone: true);

            if (hitCount == 0)
            {
                ShipyardAudioManager.Instance?.PlaySFX("Meow", transform.position);
            }
        }

        public void PerformPounce()
        {
            if (_pounceCooldownTimer > 0f || _pounceTimer > 0f)
            {
                return;
            }

            if (Vitals != null && !Vitals.TryConsumeStamina(pounceStaminaCost))
            {
                return;
            }

            _pounceCooldownTimer = pounceCooldown;
            _pounceTimer = pounceDuration;
            _pounceDirection = transform.forward;
            _pounceDirection.y = 0f;
            if (_pounceDirection.sqrMagnitude < 0.001f)
            {
                _pounceDirection = Vector3.forward;
            }
            _pounceDirection.Normalize();

            _verticalVelocity = Mathf.Max(_verticalVelocity, 4.5f);
            _pounceHitTargets.Clear();

            ShipyardAudioManager.Instance?.PlaySFX("Pounce", transform.position);

            // Immediate close-range launch strike
            ApplyPounceStrike();
        }

        public void TriggerWhiskersSonar()
        {
            IsSonarActive = !IsSonarActive;

            ShipyardAudioManager.Instance?.PlaySFX("Sonar", transform.position);
            OnWhiskersSonarPulse?.Invoke();

            ToggleExternalWhiskersSonarController();

            RatPreyAI[] rats = FindObjectsByType<RatPreyAI>(FindObjectsSortMode.None);
            float sonarRadiusSq = sonarRadius * sonarRadius;
            for (int i = 0; i < rats.Length; i++)
            {
                RatPreyAI rat = rats[i];
                if (rat == null || !rat.IsAlive)
                {
                    continue;
                }

                if ((rat.Position - transform.position).sqrMagnitude <= sonarRadiusSq)
                {
                    rat.HighlightSonar(sonarHighlightDuration);
                }
            }
        }

        public void TeleportTo(Vector3 position, Quaternion rotation)
        {
            bool wasEnabled = _characterController != null && _characterController.enabled;
            if (_characterController != null)
            {
                _characterController.enabled = false;
            }

            transform.SetPositionAndRotation(position, rotation);
            _verticalVelocity = 0f;
            _pounceTimer = 0f;
            _currentHorizontalVelocity = Vector3.zero;

            if (_characterController != null)
            {
                _characterController.enabled = wasEnabled;
            }
        }

        private void UpdateCooldowns(float dt)
        {
            if (_swipeCooldownTimer > 0f)
            {
                _swipeCooldownTimer = Mathf.Max(0f, _swipeCooldownTimer - dt);
            }

            if (_pounceCooldownTimer > 0f)
            {
                _pounceCooldownTimer = Mathf.Max(0f, _pounceCooldownTimer - dt);
            }

            if (_swipeAnimTimer > 0f)
            {
                _swipeAnimTimer = Mathf.Max(0f, _swipeAnimTimer - dt);
            }
        }

        private void HandleActionInputs(Keyboard keyboard)
        {
            if (keyboard == null)
            {
                return;
            }

            if (keyboard.jKey.wasPressedThisFrame)
            {
                PerformPawSwipe();
            }

            if (keyboard.fKey.wasPressedThisFrame)
            {
                PerformPounce();
            }

            if (keyboard.qKey.wasPressedThisFrame)
            {
                TriggerWhiskersSonar();
            }
        }

        private void HandleMovement(Keyboard keyboard, float dt)
        {
            bool isGrounded = _characterController.isGrounded;
            if (isGrounded && _verticalVelocity < 0f)
            {
                _verticalVelocity = -2f;
            }

            if (_pounceTimer > 0f)
            {
                _pounceTimer -= dt;
                _currentHorizontalVelocity = _pounceDirection * pounceSpeed;
                ApplyPounceStrike();
            }
            else
            {
                Vector2 moveInput = ReadMoveInput(keyboard);
                Vector3 moveDir = GetCameraRelativeDirection(moveInput);

                bool wantsSprint = keyboard != null &&
                                   (keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed) &&
                                   moveDir.sqrMagnitude > 0.01f;

                bool isSprinting = false;
                if (wantsSprint && Vitals != null)
                {
                    isSprinting = Vitals.TryConsumeStamina(sprintStaminaCostPerSec * dt);
                }
                else if (Vitals != null)
                {
                    Vitals.RegenerateStamina(staminaRegenPerSec, dt);
                }

                float targetSpeed = isSprinting ? sprintSpeed : walkSpeed;
                _currentHorizontalVelocity = moveDir * targetSpeed;

                if (moveDir.sqrMagnitude > 0.001f)
                {
                    Quaternion targetRotation = Quaternion.LookRotation(moveDir, Vector3.up);
                    transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, rotationSpeed * dt);
                }

                if (isGrounded && keyboard != null && keyboard.spaceKey.wasPressedThisFrame)
                {
                    _verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
                }
            }

            _verticalVelocity += gravity * dt;

            Vector3 velocity = _currentHorizontalVelocity;
            velocity.y = _verticalVelocity;
            _characterController.Move(velocity * dt);
        }

        private void ApplyIdleGravity(float dt)
        {
            if (_characterController.isGrounded && _verticalVelocity < 0f)
            {
                _verticalVelocity = -2f;
            }
            else
            {
                _verticalVelocity += gravity * dt;
            }

            _currentHorizontalVelocity = Vector3.zero;
            _characterController.Move(new Vector3(0f, _verticalVelocity, 0f) * dt);
        }

        private static Vector2 ReadMoveInput(Keyboard keyboard)
        {
            if (keyboard == null)
            {
                return Vector2.zero;
            }

            float x = 0f;
            float y = 0f;

            if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed) y += 1f;
            if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed) y -= 1f;
            if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) x += 1f;
            if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) x -= 1f;

            Vector2 input = new Vector2(x, y);
            if (input.sqrMagnitude > 1f)
            {
                input.Normalize();
            }

            return input;
        }

        private static Vector3 GetCameraRelativeDirection(Vector2 moveInput)
        {
            if (moveInput.sqrMagnitude < 0.0001f)
            {
                return Vector3.zero;
            }

            Camera mainCam = Camera.main;
            Vector3 forward = mainCam != null ? mainCam.transform.forward : Vector3.forward;
            Vector3 right = mainCam != null ? mainCam.transform.right : Vector3.right;

            forward.y = 0f;
            right.y = 0f;

            if (forward.sqrMagnitude > 0.0001f) forward.Normalize();
            else forward = Vector3.forward;

            if (right.sqrMagnitude > 0.0001f) right.Normalize();
            else right = Vector3.right;

            Vector3 direction = forward * moveInput.y + right * moveInput.x;
            if (direction.sqrMagnitude > 1f)
            {
                direction.Normalize();
            }

            return direction;
        }

        private int ApplyMeleeDamageInSphere(Vector3 center, float radius, float damage, bool requireForwardCone)
        {
            Collider[] hits = Physics.OverlapSphere(center, radius, ~0, QueryTriggerInteraction.Collide);
            HashSet<IDamageable> damagedThisSwing = new HashSet<IDamageable>();

            for (int i = 0; i < hits.Length; i++)
            {
                Collider col = hits[i];
                if (col == null || col.transform.IsChildOf(transform))
                {
                    continue;
                }

                IDamageable damageable = col.GetComponentInParent<IDamageable>();
                if (damageable == null || !damageable.IsAlive || damagedThisSwing.Contains(damageable))
                {
                    continue;
                }

                if (requireForwardCone)
                {
                    Vector3 toTarget = damageable.Position - transform.position;
                    toTarget.y = 0f;
                    float distSq = toTarget.sqrMagnitude;
                    if (distSq > 2.25f)
                    {
                        float dot = Vector3.Dot(transform.forward, toTarget.normalized);
                        if (dot < -0.25f)
                        {
                            continue;
                        }
                    }
                }

                damageable.TakeDamage(damage, transform.position);
                damagedThisSwing.Add(damageable);
            }

            return damagedThisSwing.Count;
        }

        private void ApplyPounceStrike()
        {
            Vector3 strikeOrigin = transform.position + transform.forward * 0.65f + Vector3.up * 0.35f;
            Collider[] hits = Physics.OverlapSphere(strikeOrigin, swipeRadius, ~0, QueryTriggerInteraction.Collide);

            for (int i = 0; i < hits.Length; i++)
            {
                Collider col = hits[i];
                if (col == null || col.transform.IsChildOf(transform))
                {
                    continue;
                }

                IDamageable damageable = col.GetComponentInParent<IDamageable>();
                if (damageable == null || !damageable.IsAlive || _pounceHitTargets.Contains(damageable))
                {
                    continue;
                }

                damageable.TakeDamage(pounceDamage, transform.position);
                _pounceHitTargets.Add(damageable);
            }
        }

        private void ToggleNightShift()
        {
            DiurnalShiftManager shiftManager = DiurnalShiftManager.Instance != null
                ? DiurnalShiftManager.Instance
                : FindAnyObjectByType<DiurnalShiftManager>();

            shiftManager?.ToggleNightShift();
            OnToggleNightShiftRequested?.Invoke();
        }

        private void ToggleExternalWhiskersSonarController()
        {
            Component localSonar = GetComponent("WhiskersSonarController");
            if (localSonar == null)
            {
                localSonar = FindComponentByTypeName("WhiskersSonarController");
            }

            if (localSonar == null)
            {
                return;
            }

            MethodInfo toggleMethod = localSonar.GetType().GetMethod("ToggleSonar", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (toggleMethod != null && toggleMethod.GetParameters().Length == 0)
            {
                toggleMethod.Invoke(localSonar, null);
                return;
            }

            if (localSonar is Behaviour behaviour)
            {
                behaviour.enabled = IsSonarActive;
            }
        }

        private static Component FindComponentByTypeName(string typeName)
        {
            Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
            for (int i = 0; i < assemblies.Length; i++)
            {
                Type[] types;
                try
                {
                    types = assemblies[i].GetTypes();
                }
                catch (ReflectionTypeLoadException ex)
                {
                    types = ex.Types;
                }

                if (types == null) continue;

                for (int j = 0; j < types.Length; j++)
                {
                    Type t = types[j];
                    if (t != null && t.Name == typeName && typeof(UnityEngine.Object).IsAssignableFrom(t))
                    {
                        UnityEngine.Object found = FindAnyObjectByType(t);
                        return found as Component;
                    }
                }
            }

            return null;
        }

        private void ConfigureCharacterController()
        {
            if (_characterController == null)
            {
                return;
            }

            if (_characterController.height > 1.2f)
            {
                _characterController.height = 0.85f;
                _characterController.radius = 0.30f;
                _characterController.center = new Vector3(0f, 0.425f, 0f);
            }

            _characterController.stepOffset = Mathf.Min(_characterController.stepOffset, 0.35f);
            _characterController.slopeLimit = Mathf.Max(_characterController.slopeLimit, 50f);
        }

        private void EnsureProceduralCatVisuals()
        {
            Renderer existingRenderer = GetComponentInChildren<Renderer>();
            if (existingRenderer != null)
            {
                return;
            }

            Color orangeFur = ResolvePaletteColor("AlbaOrange", new Color(0.89f, 0.46f, 0.14f));
            Color darkStripe = ResolvePaletteColor("AlbaStripe", new Color(0.56f, 0.25f, 0.07f));
            Color whiteFur = ResolvePaletteColor("AlbaWhite", new Color(0.96f, 0.94f, 0.89f));
            Color vestOrange = ResolvePaletteColor("SafetyVestOrange", new Color(1.0f, 0.50f, 0.04f));
            Color vestStripe = ResolvePaletteColor("HighVisYellow", new Color(0.92f, 0.96f, 0.22f));
            Color nosePink = ResolvePaletteColor("NosePink", new Color(0.93f, 0.54f, 0.57f));
            Color eyeGreen = ResolvePaletteColor("EyeGreen", new Color(0.32f, 0.84f, 0.34f));

            Material orangeMat = CreateURPMaterial(orangeFur, 0.15f);
            Material stripeMat = CreateURPMaterial(darkStripe, 0.15f);
            Material whiteMat = CreateURPMaterial(whiteFur, 0.12f);
            Material vestMat = CreateURPMaterial(vestOrange, 0.35f);
            Material reflectiveMat = CreateURPMaterial(vestStripe, 0.65f);
            Material noseMat = CreateURPMaterial(nosePink, 0.3f);
            Material eyeMat = CreateURPMaterial(eyeGreen, 0.8f);

            _visualRoot = new GameObject("AlbaVisualRoot").transform;
            _visualRoot.SetParent(transform, false);

            // Torso aligned along Z (+Z is forward)
            CreateBodyPart("Torso", PrimitiveType.Capsule, _visualRoot, new Vector3(0f, 0.33f, 0f),
                Quaternion.Euler(90f, 0f, 0f), new Vector3(0.30f, 0.29f, 0.28f), orangeMat);

            // White chest & belly patch
            CreateBodyPart("ChestPatch", PrimitiveType.Sphere, _visualRoot, new Vector3(0f, 0.30f, 0.20f),
                Quaternion.identity, new Vector3(0.22f, 0.20f, 0.20f), whiteMat);

            // Tabby stripes across back
            CreateBodyPart("Stripe1", PrimitiveType.Cube, _visualRoot, new Vector3(0f, 0.44f, -0.14f),
                Quaternion.identity, new Vector3(0.22f, 0.04f, 0.06f), stripeMat);
            CreateBodyPart("Stripe2", PrimitiveType.Cube, _visualRoot, new Vector3(0f, 0.44f, -0.22f),
                Quaternion.identity, new Vector3(0.18f, 0.04f, 0.05f), stripeMat);

            // Shipyard safety vest + reflective stripe
            CreateBodyPart("SafetyVest", PrimitiveType.Cube, _visualRoot, new Vector3(0f, 0.35f, 0.04f),
                Quaternion.identity, new Vector3(0.32f, 0.25f, 0.28f), vestMat);
            CreateBodyPart("ReflectiveBand", PrimitiveType.Cube, _visualRoot, new Vector3(0f, 0.36f, 0.04f),
                Quaternion.identity, new Vector3(0.335f, 0.06f, 0.29f), reflectiveMat);

            // Head & Snout strictly facing +Z
            _headPivot = new GameObject("HeadPivot").transform;
            _headPivot.SetParent(_visualRoot, false);
            _headPivot.localPosition = new Vector3(0f, 0.48f, 0.31f);

            CreateBodyPart("Head", PrimitiveType.Sphere, _headPivot, Vector3.zero,
                Quaternion.identity, new Vector3(0.26f, 0.24f, 0.26f), orangeMat);
            CreateBodyPart("Snout", PrimitiveType.Sphere, _headPivot, new Vector3(0f, -0.04f, 0.12f),
                Quaternion.identity, new Vector3(0.14f, 0.10f, 0.12f), whiteMat);
            CreateBodyPart("Nose", PrimitiveType.Sphere, _headPivot, new Vector3(0f, -0.02f, 0.18f),
                Quaternion.identity, new Vector3(0.045f, 0.035f, 0.04f), noseMat);

            // Eyes (+Z face)
            CreateBodyPart("EyeLeft", PrimitiveType.Sphere, _headPivot, new Vector3(-0.065f, 0.035f, 0.11f),
                Quaternion.identity, new Vector3(0.045f, 0.045f, 0.04f), eyeMat);
            CreateBodyPart("EyeRight", PrimitiveType.Sphere, _headPivot, new Vector3(0.065f, 0.035f, 0.11f),
                Quaternion.identity, new Vector3(0.045f, 0.045f, 0.04f), eyeMat);

            // Ears
            CreateBodyPart("EarLeft", PrimitiveType.Cube, _headPivot, new Vector3(-0.085f, 0.125f, -0.01f),
                Quaternion.Euler(8f, 0f, 18f), new Vector3(0.07f, 0.11f, 0.05f), orangeMat);
            CreateBodyPart("EarRight", PrimitiveType.Cube, _headPivot, new Vector3(0.085f, 0.125f, -0.01f),
                Quaternion.Euler(8f, 0f, -18f), new Vector3(0.07f, 0.11f, 0.05f), orangeMat);

            // Four legs with white paws
            _frontLeftLeg = CreateLeg("FrontLeftLeg", new Vector3(-0.10f, 0.24f, 0.17f), orangeMat, whiteMat);
            _frontRightLeg = CreateLeg("FrontRightLeg", new Vector3(0.10f, 0.24f, 0.17f), orangeMat, whiteMat);
            _backLeftLeg = CreateLeg("BackLeftLeg", new Vector3(-0.10f, 0.24f, -0.18f), orangeMat, whiteMat);
            _backRightLeg = CreateLeg("BackRightLeg", new Vector3(0.10f, 0.24f, -0.18f), orangeMat, whiteMat);

            // Tail extending toward -Z
            _tailPivot = new GameObject("TailPivot").transform;
            _tailPivot.SetParent(_visualRoot, false);
            _tailPivot.localPosition = new Vector3(0f, 0.38f, -0.28f);

            CreateBodyPart("TailBase", PrimitiveType.Capsule, _tailPivot, new Vector3(0f, 0.10f, -0.14f),
                Quaternion.Euler(-55f, 0f, 0f), new Vector3(0.06f, 0.18f, 0.06f), orangeMat);
            CreateBodyPart("TailTip", PrimitiveType.Sphere, _tailPivot, new Vector3(0f, 0.22f, -0.27f),
                Quaternion.identity, new Vector3(0.065f, 0.065f, 0.065f), whiteMat);
        }

        private Transform CreateLeg(string legName, Vector3 pivotLocalPos, Material furMat, Material pawMat)
        {
            Transform legPivot = new GameObject(legName).transform;
            legPivot.SetParent(_visualRoot, false);
            legPivot.localPosition = pivotLocalPos;

            CreateBodyPart("UpperLeg", PrimitiveType.Capsule, legPivot, new Vector3(0f, -0.10f, 0f),
                Quaternion.identity, new Vector3(0.075f, 0.11f, 0.075f), furMat);
            CreateBodyPart("Paw", PrimitiveType.Sphere, legPivot, new Vector3(0f, -0.20f, 0.02f),
                Quaternion.identity, new Vector3(0.08f, 0.06f, 0.10f), pawMat);

            return legPivot;
        }

        private static GameObject CreateBodyPart(
            string partName,
            PrimitiveType primitiveType,
            Transform parent,
            Vector3 localPos,
            Quaternion localRot,
            Vector3 localScale,
            Material material)
        {
            GameObject part = GameObject.CreatePrimitive(primitiveType);
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
            if (rend != null && material != null)
            {
                rend.sharedMaterial = material;
            }

            return part;
        }

        private static Material CreateURPMaterial(Color color, float smoothness)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            Material mat = new Material(shader);
            mat.color = color;
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", color);
            }
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }
            return mat;
        }

        private static Color ResolvePaletteColor(string memberName, Color fallback)
        {
            Type paletteType = Type.GetType("ShipyardCat.Core.ShipyardPalette, Assembly-CSharp");
            if (paletteType == null)
            {
                Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
                for (int i = 0; i < assemblies.Length; i++)
                {
                    paletteType = assemblies[i].GetType("ShipyardCat.Core.ShipyardPalette");
                    if (paletteType != null)
                    {
                        break;
                    }
                }
            }

            if (paletteType == null)
            {
                return fallback;
            }

            PropertyInfo prop = paletteType.GetProperty(memberName, BindingFlags.Public | BindingFlags.Static);
            if (prop != null && prop.PropertyType == typeof(Color))
            {
                return (Color)prop.GetValue(null);
            }

            FieldInfo field = paletteType.GetField(memberName, BindingFlags.Public | BindingFlags.Static);
            if (field != null && field.FieldType == typeof(Color))
            {
                return (Color)field.GetValue(null);
            }

            return fallback;
        }

        private void UpdateProceduralAnimation(float horizontalSpeed, float dt)
        {
            if (_visualRoot == null)
            {
                return;
            }

            float speedFactor = Mathf.Clamp01(horizontalSpeed / sprintSpeed);
            _walkCycleTime += dt * Mathf.Lerp(2.5f, 16f, speedFactor);

            float legAngle = Mathf.Sin(_walkCycleTime) * 32f * speedFactor;
            if (_frontLeftLeg != null) _frontLeftLeg.localRotation = Quaternion.Euler(legAngle, 0f, 0f);
            if (_backRightLeg != null) _backRightLeg.localRotation = Quaternion.Euler(legAngle, 0f, 0f);
            if (_frontRightLeg != null) _frontRightLeg.localRotation = Quaternion.Euler(-legAngle, 0f, 0f);
            if (_backLeftLeg != null) _backLeftLeg.localRotation = Quaternion.Euler(-legAngle, 0f, 0f);

            if (_tailPivot != null)
            {
                float tailWag = Mathf.Sin(Time.time * (IsSonarActive ? 9f : 4f)) * 18f;
                float tailPitch = _pounceTimer > 0f ? -20f : 8f * speedFactor;
                _tailPivot.localRotation = Quaternion.Euler(tailPitch, tailWag, 0f);
            }

            if (_headPivot != null)
            {
                float swipeRoll = _swipeAnimTimer > 0f ? Mathf.Sin(_swipeAnimTimer * 28f) * 14f : 0f;
                _headPivot.localRotation = Quaternion.Euler(0f, 0f, swipeRoll);
            }

            float bobOffset = Mathf.Abs(Mathf.Sin(_walkCycleTime)) * 0.035f * speedFactor;
            _visualRoot.localPosition = new Vector3(0f, bobOffset, 0f);
        }
    }
}
