using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace ShipyardCat.Player
{
    [DisallowMultipleComponent]
    public class PounceTrajectoryVisualizer : MonoBehaviour
    {
        private const int ArcSegmentCount = 32;
        private const int ArcPointCount = ArcSegmentCount + 1;
        private const int RingSegmentCount = 32;
        private const int RaycastBufferSize = 16;

        private static readonly Color LuminousCyan = new Color(0.306f, 0.949f, 0.824f, 1f); // #4EF2D2

        public static event Action<string> OnPouncePromptChanged;

        [Header("References")]
        [SerializeField] private AlbaController albaController;
        [SerializeField] private Camera aimCamera;
        [SerializeField] private LineRenderer arcRenderer;
        [SerializeField] private LineRenderer landingRingRenderer;

        [Header("Trajectory Settings")]
        [SerializeField] private Vector3 originOffset = new Vector3(0f, 0.35f, 0.25f);
        [SerializeField] private float launchSpeed = 11f;
        [SerializeField] private float upwardPitchDegrees = 22f;
        [SerializeField] private float maxFlightTime = 1.6f;
        [SerializeField] private float gravityMultiplier = 1.25f;

        [Header("Visual Settings")]
        [SerializeField] private float arcWidth = 0.055f;
        [SerializeField] private float ringWidth = 0.045f;
        [SerializeField] private float ringRadius = 0.42f;
        [SerializeField] private float ringSurfaceOffset = 0.02f;
        [SerializeField] private float dashTileDensity = 1.5f;
        [SerializeField] private float dashScrollSpeed = 1.5f;
        [SerializeField] private float pulseAmplitude = 0.15f;
        [SerializeField] private float pulseFrequency = 5f;

        public LineRenderer ArcRenderer { get; private set; }
        public LineRenderer LandingRingRenderer { get; private set; }
        public bool IsAiming { get; private set; }
        public Vector3 PredictedLandingPoint { get; private set; }
        public int ConfiguredArcSegmentCount => ArcSegmentCount;

        private readonly Vector3[] _arcPoints = new Vector3[ArcPointCount];
        private readonly Vector3[] _ringPoints = new Vector3[RingSegmentCount];
        private readonly RaycastHit[] _raycastHits = new RaycastHit[RaycastBufferSize];
        private readonly Collider[] _perchSnapBuffer = new Collider[24];

        private Collider[] _ownColliders;
        private Material _arcMaterial;
        private Material _ringMaterial;
        private Texture2D _dashTexture;
        private int _enemyLayer = -1;

        private Collider _lastHitCollider;
        private bool _hadValidHit;
        private string _lastEmittedPrompt = string.Empty;
        private float _dashOffset;

        private void Awake()
        {
            if (albaController == null)
            {
                albaController = GetComponent<AlbaController>();
                if (albaController == null)
                {
                    albaController = GetComponentInParent<AlbaController>();
                }
            }

            _ownColliders = albaController != null
                ? albaController.GetComponentsInChildren<Collider>(true)
                : GetComponentsInChildren<Collider>(true);

            _enemyLayer = LayerMask.NameToLayer("Enemy");

            InitializeRenderers();
            SetVisualsActive(false);
        }

        private void OnDisable()
        {
            DeactivateAiming();
        }

        private void OnDestroy()
        {
            if (_arcMaterial != null)
            {
                Destroy(_arcMaterial);
            }

            if (_ringMaterial != null)
            {
                Destroy(_ringMaterial);
            }

            if (_dashTexture != null)
            {
                Destroy(_dashTexture);
            }
        }

        private void Update()
        {
            if (!CanAim())
            {
                if (IsAiming)
                {
                    DeactivateAiming();
                }
                return;
            }

            bool wantsAim = IsAimInputPressed();
            if (!wantsAim)
            {
                if (IsAiming)
                {
                    DeactivateAiming();
                }
                return;
            }

            if (!IsAiming)
            {
                IsAiming = true;
                SetVisualsActive(true);
            }

            UpdateTrajectoryAndRing();
            UpdateDashVisualPulse();
        }

        private bool CanAim()
        {
            return albaController != null && albaController.isActiveAndEnabled;
        }

        private static bool IsAimInputPressed()
        {
            bool rightMousePressed = Mouse.current != null && Mouse.current.rightButton.isPressed;
            bool fKeyPressed = Keyboard.current != null && Keyboard.current.fKey.isPressed;
            return rightMousePressed || fKeyPressed;
        }

        private void DeactivateAiming()
        {
            IsAiming = false;
            _lastHitCollider = null;
            _hadValidHit = false;
            SetVisualsActive(false);
            EmitPromptIfChanged(string.Empty);
        }

        private void SetVisualsActive(bool active)
        {
            if (ArcRenderer != null && ArcRenderer.enabled != active)
            {
                ArcRenderer.enabled = active;
            }

            if (LandingRingRenderer != null && LandingRingRenderer.enabled != active)
            {
                LandingRingRenderer.enabled = active;
            }
        }

        private void UpdateTrajectoryAndRing()
        {
            Vector3 startPos = transform.TransformPoint(originOffset);
            Vector3 initialVelocity = ComputeInitialVelocity();
            Vector3 gravity = Physics.gravity * gravityMultiplier;
            float dt = maxFlightTime / ArcSegmentCount;

            _arcPoints[0] = startPos;
            int pointCount = 1;

            bool hitSurface = false;
            RaycastHit closestHit = default;

            for (int i = 1; i <= ArcSegmentCount; i++)
            {
                float t = i * dt;
                Vector3 nextPos = startPos + initialVelocity * t + 0.5f * gravity * (t * t);
                Vector3 prevPos = _arcPoints[i - 1];
                Vector3 segment = nextPos - prevPos;
                float segmentLength = segment.magnitude;

                if (segmentLength > 0.0001f &&
                    TryRaycastSegment(prevPos, segment / segmentLength, segmentLength, out closestHit))
                {
                    _arcPoints[i] = closestHit.point;
                    pointCount = i + 1;
                    hitSurface = true;
                    break;
                }

                _arcPoints[i] = nextPos;
                pointCount = i + 1;
            }

            ArcRenderer.positionCount = pointCount;
            ArcRenderer.SetPositions(_arcPoints);

            if (hitSurface)
            {
                Vector3 targetPoint = closestHit.point;
                Vector3 targetNormal = closestHit.normal;
                Collider targetCollider = closestHit.collider;

                if (TryFindElevatedPerchSnap(targetPoint, out Collider snappedCol, out Vector3 snappedPoint))
                {
                    targetPoint = snappedPoint;
                    targetNormal = Vector3.up;
                    targetCollider = snappedCol;
                    _arcPoints[pointCount - 1] = targetPoint;
                    ArcRenderer.SetPositions(_arcPoints);
                }

                PredictedLandingPoint = targetPoint;
                UpdateLandingRing(targetPoint, targetNormal);
                UpdatePromptForHit(targetCollider);
            }
            else
            {
                Vector3 endPoint = _arcPoints[pointCount - 1];
                PredictedLandingPoint = endPoint;
                UpdateLandingRing(endPoint, Vector3.up);
                UpdatePromptForNoHit();
            }
        }

        private bool TryFindElevatedPerchSnap(Vector3 landingPoint, out Collider perchCollider, out Vector3 snappedTop)
        {
            perchCollider = null;
            snappedTop = default;

            int count = Physics.OverlapSphereNonAlloc(landingPoint, 1.35f, _perchSnapBuffer, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore);
            float bestScore = float.MaxValue;
            Vector3 forward = transform.forward;

            for (int i = 0; i < count; i++)
            {
                Collider col = _perchSnapBuffer[i];
                if (col == null || IsOwnCollider(col)) continue;

                string n = col.gameObject.name;
                bool isPerch = n.IndexOf("CatwalkDeck", StringComparison.OrdinalIgnoreCase) >= 0 ||
                               n.IndexOf("Keel", StringComparison.OrdinalIgnoreCase) >= 0 ||
                               n.IndexOf("Flatcar_Deck", StringComparison.OrdinalIgnoreCase) >= 0 ||
                               n.IndexOf("Container_Body", StringComparison.OrdinalIgnoreCase) >= 0;
                if (!isPerch) continue;

                float topY = col.bounds.max.y;
                if (topY <= transform.position.y + 0.15f || topY > transform.position.y + 4.2f) continue;

                Vector3 clamped = col.ClosestPoint(new Vector3(landingPoint.x, topY, landingPoint.z));
                clamped.y = topY;
                Vector3 toPerch = clamped - transform.position;
                Vector2 flatToPerch = new Vector2(toPerch.x, toPerch.z);
                if (flatToPerch.magnitude < 1.2f || flatToPerch.magnitude > 11.5f) continue;

                float angle = Vector3.Angle(new Vector3(forward.x, 0f, forward.z), new Vector3(toPerch.x, 0f, toPerch.z));
                if (angle > 22f) continue;

                float d = Vector3.Distance(clamped, landingPoint);
                if (d < bestScore)
                {
                    bestScore = d;
                    perchCollider = col;
                    snappedTop = clamped;
                }
            }

            return perchCollider != null;
        }

        private Vector3 ComputeInitialVelocity()
        {
            Camera cam = aimCamera != null ? aimCamera : Camera.main;
            Vector3 forward;

            if (cam != null)
            {
                forward = cam.transform.forward;
            }
            else
            {
                forward = transform.forward;
            }

            Vector3 flatForward = new Vector3(forward.x, 0f, forward.z);
            if (flatForward.sqrMagnitude < 0.0001f)
            {
                flatForward = transform.forward;
                flatForward.y = 0f;
            }
            flatForward.Normalize();

            Vector3 right = Vector3.Cross(Vector3.up, flatForward).normalized;
            float camPitch = Mathf.Asin(Mathf.Clamp(forward.y, -0.99f, 0.99f)) * Mathf.Rad2Deg;
            float finalPitch = Mathf.Clamp(camPitch + upwardPitchDegrees, -30f, 65f);

            Vector3 launchDir = Quaternion.AngleAxis(-finalPitch, right) * flatForward;
            return launchDir.normalized * launchSpeed;
        }

        private bool TryRaycastSegment(Vector3 origin, Vector3 direction, float distance, out RaycastHit validHit)
        {
            int hitCount = Physics.RaycastNonAlloc(
                origin,
                direction,
                _raycastHits,
                distance,
                Physics.DefaultRaycastLayers,
                QueryTriggerInteraction.Ignore);

            float bestDistance = float.MaxValue;
            int bestIndex = -1;

            for (int i = 0; i < hitCount; i++)
            {
                Collider col = _raycastHits[i].collider;
                if (col == null || IsOwnCollider(col))
                {
                    continue;
                }

                float d = _raycastHits[i].distance;
                if (d < bestDistance)
                {
                    bestDistance = d;
                    bestIndex = i;
                }
            }

            if (bestIndex >= 0)
            {
                validHit = _raycastHits[bestIndex];
                return true;
            }

            validHit = default;
            return false;
        }

        private bool IsOwnCollider(Collider candidate)
        {
            if (_ownColliders == null)
            {
                return false;
            }

            for (int i = 0; i < _ownColliders.Length; i++)
            {
                if (_ownColliders[i] == candidate)
                {
                    return true;
                }
            }

            return false;
        }

        private void UpdateLandingRing(Vector3 point, Vector3 normal)
        {
            Vector3 safeNormal = normal.sqrMagnitude > 0.0001f ? normal.normalized : Vector3.up;
            Quaternion rotation = Quaternion.FromToRotation(Vector3.up, safeNormal);
            Vector3 center = point + safeNormal * ringSurfaceOffset;

            float pulseScale = 1f + Mathf.Sin(Time.time * pulseFrequency) * (pulseAmplitude * 0.25f);
            float radius = ringRadius * pulseScale;
            float angleStep = (Mathf.PI * 2f) / RingSegmentCount;

            for (int i = 0; i < RingSegmentCount; i++)
            {
                float angle = i * angleStep;
                Vector3 localPos = new Vector3(Mathf.Cos(angle) * radius, 0f, Mathf.Sin(angle) * radius);
                _ringPoints[i] = center + rotation * localPos;
            }

            LandingRingRenderer.positionCount = RingSegmentCount;
            LandingRingRenderer.SetPositions(_ringPoints);
        }

        private void UpdateDashVisualPulse()
        {
            if (_arcMaterial != null && ArcRenderer != null)
            {
                float arcLength = EstimateCurrentArcLength();
                _dashOffset -= Time.deltaTime * dashScrollSpeed;
                _arcMaterial.mainTextureScale = new Vector2(Mathf.Max(1f, arcLength * dashTileDensity), 1f);
                _arcMaterial.mainTextureOffset = new Vector2(_dashOffset, 0f);
            }

            float pulse = 0.85f + Mathf.Sin(Time.time * pulseFrequency) * pulseAmplitude;
            Color pulsedColor = new Color(
                LuminousCyan.r * pulse,
                LuminousCyan.g * pulse,
                LuminousCyan.b * pulse,
                1f);

            if (ArcRenderer != null)
            {
                ArcRenderer.startColor = pulsedColor;
                ArcRenderer.endColor = pulsedColor;
            }

            if (LandingRingRenderer != null)
            {
                LandingRingRenderer.startColor = pulsedColor;
                LandingRingRenderer.endColor = pulsedColor;
            }
        }

        private float EstimateCurrentArcLength()
        {
            int count = ArcRenderer.positionCount;
            float total = 0f;
            for (int i = 1; i < count; i++)
            {
                total += Vector3.Distance(_arcPoints[i - 1], _arcPoints[i]);
            }
            return total;
        }

        private void UpdatePromptForHit(Collider hitCollider)
        {
            if (_hadValidHit && _lastHitCollider == hitCollider)
            {
                return;
            }

            _hadValidHit = true;
            _lastHitCollider = hitCollider;

            string targetName = FormatFriendlyTargetName(hitCollider.gameObject.name);
            bool isEnemy = IsEnemyTarget(hitCollider.gameObject);
            string prompt = isEnemy
                ? $"[SPACE / F] Pounce on {targetName}"
                : $"[SPACE / F] Pounce to {targetName}";

            EmitPromptIfChanged(prompt);
        }

        private void UpdatePromptForNoHit()
        {
            if (!_hadValidHit && _lastHitCollider == null && _lastEmittedPrompt.Length == 0)
            {
                return;
            }

            _hadValidHit = false;
            _lastHitCollider = null;
            EmitPromptIfChanged(string.Empty);
        }

        private bool IsEnemyTarget(GameObject target)
        {
            if (_enemyLayer >= 0 && target.layer == _enemyLayer)
            {
                return true;
            }

            string name = target.name;
            return name.IndexOf("Rat", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   name.IndexOf("Enemy", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static string FormatFriendlyTargetName(string rawName)
        {
            if (string.IsNullOrEmpty(rawName))
            {
                return "Surface";
            }

            if (rawName.IndexOf("Catwalk", StringComparison.OrdinalIgnoreCase) >= 0) return "DD1 Catwalk";
            if (rawName.IndexOf("KeelCrib", StringComparison.OrdinalIgnoreCase) >= 0 || rawName.IndexOf("TopKeelCap", StringComparison.OrdinalIgnoreCase) >= 0) return "Keel Cribbing";
            if (rawName.IndexOf("Flatcar", StringComparison.OrdinalIgnoreCase) >= 0) return "Rail Flatcar";
            if (rawName.IndexOf("Container", StringComparison.OrdinalIgnoreCase) >= 0) return "Cargo Container";
            if (rawName.IndexOf("YardAsphalt", StringComparison.OrdinalIgnoreCase) >= 0) return "Shipyard Apron";
            if (rawName.IndexOf("DockyardKingpin", StringComparison.OrdinalIgnoreCase) >= 0) return "Dockyard Kingpin";
            if (rawName.IndexOf("RatPrey", StringComparison.OrdinalIgnoreCase) >= 0) return "Sewer Rat";
            if (rawName.IndexOf("DD1_", StringComparison.OrdinalIgnoreCase) >= 0) return "Dry Dock 1";

            return CleanDisplayName(rawName);
        }

        private static string CleanDisplayName(string rawName)
        {
            if (string.IsNullOrEmpty(rawName))
            {
                return "Surface";
            }

            const string cloneSuffix = "(Clone)";
            int cloneIdx = rawName.IndexOf(cloneSuffix, StringComparison.Ordinal);
            string stripped = cloneIdx >= 0 ? rawName.Substring(0, cloneIdx).Trim() : rawName.Trim();
            return stripped.Replace('_', ' ');
        }

        private void EmitPromptIfChanged(string prompt)
        {
            if (string.Equals(_lastEmittedPrompt, prompt, StringComparison.Ordinal))
            {
                return;
            }

            _lastEmittedPrompt = prompt;
            OnPouncePromptChanged?.Invoke(prompt);
        }

        private void InitializeRenderers()
        {
            Shader defaultShader = Shader.Find("Sprites/Default");
            if (defaultShader == null)
            {
                defaultShader = Shader.Find("Unlit/Transparent");
            }

            _dashTexture = CreateDashedTexture();
            _arcMaterial = new Material(defaultShader)
            {
                mainTexture = _dashTexture,
                color = Color.white
            };
            _ringMaterial = new Material(defaultShader)
            {
                color = Color.white
            };

            ArcRenderer = arcRenderer != null ? arcRenderer : CreateChildLineRenderer("PounceArcRenderer");
            ArcRenderer.useWorldSpace = true;
            ArcRenderer.loop = false;
            ArcRenderer.positionCount = ArcPointCount;
            ArcRenderer.startWidth = arcWidth;
            ArcRenderer.endWidth = arcWidth * 0.75f;
            ArcRenderer.textureMode = LineTextureMode.Tile;
            ArcRenderer.numCapVertices = 2;
            ArcRenderer.numCornerVertices = 2;
            ArcRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ArcRenderer.receiveShadows = false;
            ArcRenderer.startColor = LuminousCyan;
            ArcRenderer.endColor = LuminousCyan;
            ArcRenderer.sharedMaterial = _arcMaterial;

            LandingRingRenderer = landingRingRenderer != null
                ? landingRingRenderer
                : CreateChildLineRenderer("PounceLandingRingRenderer");
            LandingRingRenderer.useWorldSpace = true;
            LandingRingRenderer.loop = true;
            LandingRingRenderer.positionCount = RingSegmentCount;
            LandingRingRenderer.startWidth = ringWidth;
            LandingRingRenderer.endWidth = ringWidth;
            LandingRingRenderer.numCapVertices = 2;
            LandingRingRenderer.numCornerVertices = 2;
            LandingRingRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            LandingRingRenderer.receiveShadows = false;
            LandingRingRenderer.startColor = LuminousCyan;
            LandingRingRenderer.endColor = LuminousCyan;
            LandingRingRenderer.sharedMaterial = _ringMaterial;
        }

        private LineRenderer CreateChildLineRenderer(string childName)
        {
            var child = new GameObject(childName);
            child.transform.SetParent(transform, false);
            return child.AddComponent<LineRenderer>();
        }

        private static Texture2D CreateDashedTexture()
        {
            const int width = 16;
            var texture = new Texture2D(width, 1, TextureFormat.RGBA32, false)
            {
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Point
            };

            for (int x = 0; x < width; x++)
            {
                // Sine-thresholded dash pattern: ~62% solid, ~38% gap
                float wave = Mathf.Sin((x / (float)width) * Mathf.PI * 2f);
                Color pixel = wave >= -0.25f ? Color.white : Color.clear;
                texture.SetPixel(x, 0, pixel);
            }

            texture.Apply(false, true);
            return texture;
        }
    }
}
