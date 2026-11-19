using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ShipyardCat.Player
{
    public class WhiskersSonarController : MonoBehaviour
    {
        private const int RingCount = 4;
        private const int RingSegments = 48;
        private const float MinRingRadius = 0.8f;
        private const float MaxRingRadius = 24f;
        private const float HighlightRadius = 28f;
        private const float HighlightRadiusSqr = HighlightRadius * HighlightRadius;

        private static readonly Color ElectricCyan = new Color(0.176f, 0.886f, 0.902f, 1f); // #2DE2E6
        private static readonly Color PhosphorGreenBoost = new Color(0.322f, 1f, 0.529f, 1f) * 2.6f; // #52FF87
        private static readonly Color ThermalAmberBoost = new Color(1f, 0.643f, 0.224f, 1f) * 2.8f;   // #FFA439
        private static readonly float[] RingPhaseOffsets = { 0f, 0.25f, 0.5f, 0.75f };

        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");
        private const string EmissionKeyword = "_EMISSION";

        [Header("Sonar Pulse Visuals")]
        [SerializeField] private float pulseDuration = 2.4f;
        [SerializeField] private float ringWidth = 0.08f;
        [SerializeField] private float groundYOffset = 0.06f;

        [Header("Sonar Ground Light")]
        [SerializeField] private Light sonarPointLight;
        [SerializeField] private float lightHeight = 0.65f;
        [SerializeField] private float lightRange = 12f;
        [SerializeField] private float lightIntensity = 3.2f;

        private readonly LineRenderer[] _rings = new LineRenderer[RingCount];
        private readonly Vector3[] _ringPositions = new Vector3[RingSegments];
        private readonly float[] _cosTable = new float[RingSegments];
        private readonly float[] _sinTable = new float[RingSegments];

        private readonly Collider[] _overlapBuffer = new Collider[128];
        private readonly List<MonoBehaviour> _tempBehaviours = new List<MonoBehaviour>(16);
        private readonly List<Renderer> _tempRenderers = new List<Renderer>(16);
        private readonly List<HighlightedTarget> _highlightedTargets = new List<HighlightedTarget>(32);
        private readonly HashSet<int> _highlightedTargetIds = new HashSet<int>();

        private Material _ringMaterial;
        private Transform _visualRoot;
        private bool _visualsInitialized;
        private bool _trigInitialized;
        private bool _ownsPointLight;
        private float _sonarTime;

        public bool IsSonarActive { get; private set; }
        public int ActiveRingCount => RingCount;

        private struct MaterialSnapshot
        {
            public Material Material;
            public Color OriginalEmissionColor;
            public bool HadEmissionKeyword;
            public MaterialGlobalIlluminationFlags OriginalGiFlags;
            public bool HasEmissionProperty;
        }

        private sealed class HighlightedTarget
        {
            public int InstanceId;
            public MonoBehaviour Component;
            public readonly List<MaterialSnapshot> Snapshots = new List<MaterialSnapshot>(4);
        }

        private void Awake()
        {
            EnsureTrigTable();
            EnsureVisualsInitialized();
            SetVisualsEnabled(IsSonarActive);
        }

        private void OnEnable()
        {
            if (IsSonarActive)
            {
                EnsureVisualsInitialized();
                SetVisualsEnabled(true);
                UpdateRings(_sonarTime);
                UpdatePointLight();

                if (Application.isPlaying)
                {
                    RefreshHighlightsFullScan();
                }
            }
        }

        private void Update()
        {
            if (!IsSonarActive)
            {
                return;
            }

            float duration = Mathf.Max(0.1f, pulseDuration);
            _sonarTime += Time.deltaTime;
            if (_sonarTime >= duration)
            {
                _sonarTime -= duration;
            }

            UpdateRings(_sonarTime);
            UpdatePointLight();

            if (Application.isPlaying)
            {
                UpdateHighlightsRuntime();
            }
        }

        private void OnDisable()
        {
            SetVisualsEnabled(false);
            RestoreAllHighlights();
        }

        private void OnDestroy()
        {
            RestoreAllHighlights();

            if (_ringMaterial != null)
            {
                DestroyObjectSafe(_ringMaterial);
                _ringMaterial = null;
            }

            if (_visualRoot != null)
            {
                DestroyObjectSafe(_visualRoot.gameObject);
                _visualRoot = null;
            }

            if (_ownsPointLight && sonarPointLight != null)
            {
                DestroyObjectSafe(sonarPointLight.gameObject);
                sonarPointLight = null;
            }

            _visualsInitialized = false;
        }

        public void ToggleSonar()
        {
            SetSonarActive(!IsSonarActive);
        }

        public void SetSonarActive(bool active)
        {
            if (IsSonarActive == active && _visualsInitialized)
            {
                if (!active)
                {
                    SetVisualsEnabled(false);
                    RestoreAllHighlights();
                }
                return;
            }

            IsSonarActive = active;

            if (active)
            {
                _sonarTime = 0f;
                EnsureTrigTable();
                EnsureVisualsInitialized();
                SetVisualsEnabled(true);
                UpdateRings(0f);
                UpdatePointLight();

                if (Application.isPlaying)
                {
                    RefreshHighlightsFullScan();
                }
            }
            else
            {
                SetVisualsEnabled(false);
                RestoreAllHighlights();
            }
        }

        private void EnsureTrigTable()
        {
            if (_trigInitialized)
            {
                return;
            }

            float step = (Mathf.PI * 2f) / RingSegments;
            for (int i = 0; i < RingSegments; i++)
            {
                float angle = i * step;
                _cosTable[i] = Mathf.Cos(angle);
                _sinTable[i] = Mathf.Sin(angle);
            }

            _trigInitialized = true;
        }

        private void EnsureVisualsInitialized()
        {
            if (_visualsInitialized)
            {
                return;
            }

            if (_ringMaterial == null)
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
                if (shader == null)
                {
                    shader = Shader.Find("Sprites/Default");
                }
                if (shader == null)
                {
                    shader = Shader.Find("Unlit/Color");
                }

                if (shader != null)
                {
                    _ringMaterial = new Material(shader)
                    {
                        name = "WhiskersSonarRingMaterial",
                        hideFlags = HideFlags.DontSave
                    };
                    if (_ringMaterial.HasProperty("_BaseColor"))
                    {
                        _ringMaterial.SetColor("_BaseColor", Color.white);
                    }
                    if (_ringMaterial.HasProperty("_Color"))
                    {
                        _ringMaterial.SetColor("_Color", Color.white);
                    }
                }
            }

            if (_visualRoot == null)
            {
                var rootGo = new GameObject("WhiskersSonarRings");
                rootGo.hideFlags = HideFlags.DontSave;
                _visualRoot = rootGo.transform;
                _visualRoot.SetParent(transform, false);
            }

            CreateRingPool();

            if (sonarPointLight == null)
            {
                var lightGo = new GameObject("WhiskersSonarLight");
                lightGo.hideFlags = HideFlags.DontSave;
                lightGo.transform.SetParent(transform, false);
                lightGo.transform.localPosition = new Vector3(0f, lightHeight, 0f);

                sonarPointLight = lightGo.AddComponent<Light>();
                sonarPointLight.type = LightType.Point;
                sonarPointLight.color = ElectricCyan;
                sonarPointLight.range = lightRange;
                sonarPointLight.intensity = lightIntensity;
                sonarPointLight.shadows = LightShadows.None;
                _ownsPointLight = true;
            }

            _visualsInitialized = true;
        }

        private void CreateRingPool()
        {
            ringWidth = 0.08f;

            for (int i = 0; i < RingCount; i++)
            {
                if (_rings[i] != null)
                {
                    continue;
                }

                var ringGo = new GameObject($"SonarRing_{i}");
                ringGo.hideFlags = HideFlags.DontSave;
                ringGo.transform.SetParent(_visualRoot, false);
                ringGo.transform.rotation = Quaternion.Euler(90f, 0f, 0f);

                var lr = ringGo.AddComponent<LineRenderer>();
                lr.useWorldSpace = true;
                lr.loop = true;
                lr.positionCount = RingSegments;
                lr.startWidth = ringWidth;
                lr.endWidth = ringWidth;
                lr.alignment = LineAlignment.TransformZ;
                lr.textureMode = LineTextureMode.Stretch;
                lr.shadowCastingMode = ShadowCastingMode.Off;
                lr.receiveShadows = false;
                lr.allowOcclusionWhenDynamic = false;
                lr.startColor = ElectricCyan;
                lr.endColor = ElectricCyan;

                if (_ringMaterial != null)
                {
                    lr.sharedMaterial = _ringMaterial;
                }

                _rings[i] = lr;
            }
        }

        private void SetVisualsEnabled(bool enabled)
        {
            for (int i = 0; i < RingCount; i++)
            {
                if (_rings[i] != null)
                {
                    _rings[i].enabled = enabled;
                }
            }

            if (sonarPointLight != null)
            {
                sonarPointLight.enabled = enabled;
            }
        }

        private void UpdateRings(float elapsed)
        {
            float duration = Mathf.Max(0.1f, pulseDuration);
            float normalizedTime = elapsed / duration;
            UpdateRings(transform.position, normalizedTime);
        }

        public void UpdateRings(Vector3 center, float normalizedTime)
        {
            if (!_visualsInitialized)
            {
                return;
            }

            float groundY = center.y + groundYOffset;

            for (int r = 0; r < RingCount; r++)
            {
                LineRenderer lr = _rings[r];
                if (lr == null)
                {
                    continue;
                }

                lr.transform.rotation = Quaternion.Euler(90f, 0f, 0f);

                float phase = Mathf.Repeat(normalizedTime + RingPhaseOffsets[r], 1f);
                float radius = Mathf.Lerp(MinRingRadius, MaxRingRadius, phase);

                float fadeIn = Mathf.Clamp01(phase / 0.06f);
                float fadeOut = 1f - phase;
                float alpha = fadeIn * fadeOut * fadeOut;

                Color ringColor = new Color(ElectricCyan.r, ElectricCyan.g, ElectricCyan.b, alpha);
                lr.startColor = ringColor;
                lr.endColor = ringColor;

                float width = Mathf.Lerp(ringWidth, ringWidth * 0.45f, phase);
                lr.startWidth = width;
                lr.endWidth = width;

                for (int s = 0; s < RingSegments; s++)
                {
                    _ringPositions[s] = new Vector3(
                        center.x + _cosTable[s] * radius,
                        groundY,
                        center.z + _sinTable[s] * radius
                    );
                }

                lr.SetPositions(_ringPositions);
            }
        }

        private void UpdatePointLight()
        {
            if (sonarPointLight == null)
            {
                return;
            }

            sonarPointLight.color = ElectricCyan;
            sonarPointLight.range = lightRange;

            float pulse = 0.85f + 0.15f * Mathf.Sin((_sonarTime / Mathf.Max(0.1f, pulseDuration)) * Mathf.PI * 2f);
            sonarPointLight.intensity = lightIntensity * pulse;

            if (_ownsPointLight)
            {
                sonarPointLight.transform.localPosition = new Vector3(0f, lightHeight, 0f);
            }
        }

        private void RefreshHighlightsFullScan()
        {
            if (!Application.isPlaying)
            {
                return;
            }

            Vector3 origin = transform.position;
            MonoBehaviour[] allBehaviours = FindObjectsByType<MonoBehaviour>(
                FindObjectsInactive.Exclude,
                FindObjectsSortMode.None
            );

            for (int i = 0; i < allBehaviours.Length; i++)
            {
                MonoBehaviour mb = allBehaviours[i];
                if (mb == null || !mb.isActiveAndEnabled)
                {
                    continue;
                }

                if (!TryGetHighlightColor(mb, out Color boostColor))
                {
                    continue;
                }

                if ((mb.transform.position - origin).sqrMagnitude <= HighlightRadiusSqr)
                {
                    TryApplyHighlight(mb, boostColor);
                }
            }
        }

        private void UpdateHighlightsRuntime()
        {
            Vector3 origin = transform.position;

            for (int i = _highlightedTargets.Count - 1; i >= 0; i--)
            {
                HighlightedTarget entry = _highlightedTargets[i];
                if (entry.Component == null ||
                    !entry.Component.isActiveAndEnabled ||
                    (entry.Component.transform.position - origin).sqrMagnitude > HighlightRadiusSqr)
                {
                    RestoreTarget(entry);
                    _highlightedTargetIds.Remove(entry.InstanceId);
                    _highlightedTargets.RemoveAt(i);
                }
            }

            int hitCount = Physics.OverlapSphereNonAlloc(
                origin,
                HighlightRadius,
                _overlapBuffer,
                ~0,
                QueryTriggerInteraction.Collide
            );

            for (int i = 0; i < hitCount; i++)
            {
                Collider col = _overlapBuffer[i];
                if (col == null)
                {
                    continue;
                }

                _tempBehaviours.Clear();
                col.GetComponentsInParent(false, _tempBehaviours);

                for (int b = 0; b < _tempBehaviours.Count; b++)
                {
                    MonoBehaviour mb = _tempBehaviours[b];
                    if (mb == null || !mb.isActiveAndEnabled)
                    {
                        continue;
                    }

                    if (!TryGetHighlightColor(mb, out Color boostColor))
                    {
                        continue;
                    }

                    if ((mb.transform.position - origin).sqrMagnitude <= HighlightRadiusSqr)
                    {
                        TryApplyHighlight(mb, boostColor);
                    }
                }
            }
        }

        public static bool TryGetHighlightColorForType(string typeName, out Color boostColor)
        {
            switch (typeName)
            {
                case "RatPreyAI":
                    boostColor = PhosphorGreenBoost;
                    return true;
                case "MutantCatAI":
                case "KingpinBossAI":
                case "LieutenantCobaltBossAI":
                    boostColor = ThermalAmberBoost;
                    return true;
                default:
                    boostColor = default;
                    return false;
            }
        }

        private static bool TryGetHighlightColor(MonoBehaviour behaviour, out Color boostColor)
        {
            return TryGetHighlightColorForType(behaviour.GetType().Name, out boostColor);
        }

        private void TryApplyHighlight(MonoBehaviour target, Color boostColor)
        {
            if (!Application.isPlaying)
            {
                return;
            }

            int id = System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(target);
            if (!_highlightedTargetIds.Add(id))
            {
                return;
            }

            var entry = new HighlightedTarget
            {
                InstanceId = id,
                Component = target
            };

            _tempRenderers.Clear();
            target.GetComponentsInChildren(false, _tempRenderers);

            for (int r = 0; r < _tempRenderers.Count; r++)
            {
                Renderer rend = _tempRenderers[r];
                if (rend == null)
                {
                    continue;
                }

                Material[] mats = rend.materials;
                for (int m = 0; m < mats.Length; m++)
                {
                    Material mat = mats[m];
                    if (mat == null)
                    {
                        continue;
                    }

                    bool hasEmission = mat.HasProperty(EmissionColorId);
                    var snapshot = new MaterialSnapshot
                    {
                        Material = mat,
                        HasEmissionProperty = hasEmission,
                        OriginalEmissionColor = hasEmission ? mat.GetColor(EmissionColorId) : Color.black,
                        HadEmissionKeyword = mat.IsKeywordEnabled(EmissionKeyword),
                        OriginalGiFlags = mat.globalIlluminationFlags
                    };

                    entry.Snapshots.Add(snapshot);

                    mat.EnableKeyword(EmissionKeyword);
                    mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                    if (hasEmission)
                    {
                        mat.SetColor(EmissionColorId, boostColor);
                    }
                }
            }

            _highlightedTargets.Add(entry);
        }

        private void RestoreAllHighlights()
        {
            for (int i = 0; i < _highlightedTargets.Count; i++)
            {
                RestoreTarget(_highlightedTargets[i]);
            }

            _highlightedTargets.Clear();
            _highlightedTargetIds.Clear();
        }

        private static void RestoreTarget(HighlightedTarget entry)
        {
            for (int i = 0; i < entry.Snapshots.Count; i++)
            {
                MaterialSnapshot snap = entry.Snapshots[i];
                if (snap.Material == null)
                {
                    continue;
                }

                if (snap.HasEmissionProperty)
                {
                    snap.Material.SetColor(EmissionColorId, snap.OriginalEmissionColor);
                }

                if (snap.HadEmissionKeyword)
                {
                    snap.Material.EnableKeyword(EmissionKeyword);
                }
                else
                {
                    snap.Material.DisableKeyword(EmissionKeyword);
                }

                snap.Material.globalIlluminationFlags = snap.OriginalGiFlags;
            }
        }

        private static void DestroyObjectSafe(UnityEngine.Object obj)
        {
            if (obj == null)
            {
                return;
            }

            if (Application.isPlaying)
            {
                Destroy(obj);
            }
            else
            {
                DestroyImmediate(obj);
            }
        }
    }
}
