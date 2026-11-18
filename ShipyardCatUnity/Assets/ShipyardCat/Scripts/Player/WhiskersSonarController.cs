using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using ShipyardCat.AI;
using ShipyardCat.Core;

namespace ShipyardCat.Player
{
    public class WhiskersSonarController : MonoBehaviour
    {
        private struct MaterialEmissionSnapshot
        {
            public bool HadEmissionKeyword;
            public bool HasEmissionProperty;
            public Color OriginalEmissionColor;
        }

        [Header("Sonar Timing & Range")]
        [SerializeField] private float pulseInterval = 1.6f;
        [SerializeField] private float pulseDuration = 0.85f;
        [SerializeField] private float maxPulseRadius = 24f;
        [SerializeField] private float emissionIntensity = 2.25f;

        [Header("Visual Feedback")]
        [SerializeField] private float maxLightIntensity = 6f;
        [SerializeField] private float lightRange = 18f;
        [SerializeField] private float ringWidth = 0.14f;
        [SerializeField] private int ringSegments = 48;

        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");
        private const string EmissionKeyword = "_EMISSION";

        private readonly Dictionary<Material, MaterialEmissionSnapshot> _cachedMaterials =
            new Dictionary<Material, MaterialEmissionSnapshot>();

        private readonly List<Material> _staleMaterialsBuffer = new List<Material>();

        private Light _sonarLight;
        private LineRenderer _pulseRing;
        private Material _ringMaterial;
        private float _pulseTimer;
        private float _pulseElapsed;
        private bool _isPulsing;

        public bool IsSonarActive { get; private set; }

        private void Awake()
        {
            EnsureVisualRig();
            SetVisualsActive(false);
        }

        private void Update()
        {
            if (!IsSonarActive)
            {
                return;
            }

            _pulseTimer -= Time.deltaTime;
            if (_pulseTimer <= 0f)
            {
                TriggerPulse();
                _pulseTimer = Mathf.Max(0.25f, pulseInterval);
            }

            UpdatePulseVisuals(Time.deltaTime);
            RefreshHighlightedTargets();
        }

        private void OnDisable()
        {
            if (IsSonarActive)
            {
                SetSonarActive(false);
            }
            else
            {
                RestoreAllMaterials();
            }
        }

        private void OnDestroy()
        {
            RestoreAllMaterials();
            if (_ringMaterial != null)
            {
                Destroy(_ringMaterial);
                _ringMaterial = null;
            }
        }

        public void ToggleSonar()
        {
            SetSonarActive(!IsSonarActive);
        }

        public void SetSonarActive(bool active)
        {
            if (IsSonarActive == active)
            {
                return;
            }

            IsSonarActive = active;

            if (IsSonarActive)
            {
                _pulseTimer = Mathf.Max(0.25f, pulseInterval);
                TriggerPulse();
                RefreshHighlightedTargets();
            }
            else
            {
                _isPulsing = false;
                SetVisualsActive(false);
                RestoreAllMaterials();
            }
        }

        public void TriggerPulse()
        {
            _isPulsing = true;
            _pulseElapsed = 0f;
            SetVisualsActive(true);
            ShipyardAudioManager.Instance?.PlaySFX("Sonar", transform.position);
        }

        private void EnsureVisualRig()
        {
            if (_sonarLight == null)
            {
                var lightObj = new GameObject("WhiskersSonarLight");
                lightObj.transform.SetParent(transform, false);
                lightObj.transform.localPosition = new Vector3(0f, 0.75f, 0.25f);

                _sonarLight = lightObj.AddComponent<Light>();
                _sonarLight.type = LightType.Point;
                _sonarLight.color = ShipyardPalette.ThermalPreyAmber;
                _sonarLight.range = lightRange;
                _sonarLight.intensity = 0f;
                _sonarLight.shadows = LightShadows.None;
            }

            if (_pulseRing == null)
            {
                var ringObj = new GameObject("WhiskersSonarRing");
                ringObj.transform.SetParent(transform, false);
                ringObj.transform.localPosition = new Vector3(0f, 0.15f, 0f);

                _pulseRing = ringObj.AddComponent<LineRenderer>();
                _pulseRing.useWorldSpace = false;
                _pulseRing.loop = true;
                _pulseRing.alignment = LineAlignment.TransformZ;
                ringObj.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);

                _pulseRing.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                _pulseRing.receiveShadows = false;
                _pulseRing.startWidth = ringWidth;
                _pulseRing.endWidth = ringWidth;
                _pulseRing.positionCount = Mathf.Max(12, ringSegments);

                Shader shader = Shader.Find("Universal Render Pipeline/Unlit");
                if (shader == null)
                {
                    shader = Shader.Find("Sprites/Default");
                }

                if (shader != null)
                {
                    _ringMaterial = new Material(shader);
                    SetRingColor(ShipyardPalette.ThermalPreyAmber);
                    _pulseRing.sharedMaterial = _ringMaterial;
                }
            }
        }

        private void SetVisualsActive(bool visible)
        {
            if (_sonarLight != null)
            {
                _sonarLight.enabled = visible;
                if (!visible)
                {
                    _sonarLight.intensity = 0f;
                }
            }

            if (_pulseRing != null)
            {
                _pulseRing.enabled = visible;
            }
        }

        private void UpdatePulseVisuals(float dt)
        {
            if (!_isPulsing)
            {
                if (_sonarLight != null)
                {
                    _sonarLight.intensity = Mathf.Lerp(_sonarLight.intensity, maxLightIntensity * 0.2f, dt * 8f);
                }

                if (_pulseRing != null)
                {
                    _pulseRing.enabled = false;
                }

                return;
            }

            _pulseElapsed += dt;
            float duration = Mathf.Max(0.1f, pulseDuration);
            float t = Mathf.Clamp01(_pulseElapsed / duration);

            if (_sonarLight != null)
            {
                _sonarLight.enabled = true;
                float pulseEnvelope = Mathf.Sin(t * Mathf.PI);
                _sonarLight.color = ShipyardPalette.ThermalPreyAmber;
                _sonarLight.intensity = Mathf.Lerp(maxLightIntensity * 0.25f, maxLightIntensity, pulseEnvelope);
            }

            if (_pulseRing != null)
            {
                _pulseRing.enabled = true;
                float radius = Mathf.Lerp(0.6f, maxPulseRadius, t);
                int count = _pulseRing.positionCount;
                float step = (Mathf.PI * 2f) / count;

                for (int i = 0; i < count; i++)
                {
                    float angle = i * step;
                    _pulseRing.SetPosition(i, new Vector3(Mathf.Cos(angle) * radius, Mathf.Sin(angle) * radius, 0f));
                }

                Color ringColor = ShipyardPalette.ThermalPreyAmber;
                ringColor.a = 1f - t;
                SetRingColor(ringColor);
            }

            if (t >= 1f)
            {
                _isPulsing = false;
            }
        }

        private void SetRingColor(Color color)
        {
            if (_pulseRing != null)
            {
                _pulseRing.startColor = color;
                _pulseRing.endColor = color;
            }

            if (_ringMaterial != null)
            {
                if (_ringMaterial.HasProperty(BaseColorId))
                {
                    _ringMaterial.SetColor(BaseColorId, color);
                }
                else if (_ringMaterial.HasProperty(ColorId))
                {
                    _ringMaterial.SetColor(ColorId, color);
                }
            }
        }

        private void RefreshHighlightedTargets()
        {
            var activeMaterials = new HashSet<Material>();

            RatPreyAI[] rats = FindObjectsByType<RatPreyAI>(FindObjectsSortMode.None);
            for (int i = 0; i < rats.Length; i++)
            {
                RatPreyAI rat = rats[i];
                if (rat == null || !rat.IsAlive)
                {
                    continue;
                }

                ApplyTintToObject(rat.gameObject, ShipyardPalette.ThermalPreyAmber, activeMaterials);
            }

            KingpinBossAI boss = KingpinBossAI.Instance != null
                ? KingpinBossAI.Instance
                : FindAnyObjectByType<KingpinBossAI>();

            if (boss != null && boss.IsAlive)
            {
                ApplyTintToObject(boss.gameObject, ShipyardPalette.KingpinCrimson, activeMaterials);
            }

            RestoreInactiveMaterials(activeMaterials);
        }

        private void ApplyTintToObject(GameObject target, Color tint, HashSet<Material> activeMaterials)
        {
            Renderer[] renderers = target.GetComponentsInChildren<Renderer>(false);
            Color hdrEmission = tint * emissionIntensity;

            for (int r = 0; r < renderers.Length; r++)
            {
                Renderer rendererComponent = renderers[r];
                if (rendererComponent == null)
                {
                    continue;
                }

                Material[] materials = rendererComponent.materials;
                for (int m = 0; m < materials.Length; m++)
                {
                    Material mat = materials[m];
                    if (mat == null)
                    {
                        continue;
                    }

                    activeMaterials.Add(mat);

                    if (!_cachedMaterials.ContainsKey(mat))
                    {
                        bool hasEmissionProp = mat.HasProperty(EmissionColorId);
                        _cachedMaterials.Add(mat, new MaterialEmissionSnapshot
                        {
                            HadEmissionKeyword = mat.IsKeywordEnabled(EmissionKeyword),
                            HasEmissionProperty = hasEmissionProp,
                            OriginalEmissionColor = hasEmissionProp ? mat.GetColor(EmissionColorId) : Color.black
                        });
                    }

                    mat.EnableKeyword(EmissionKeyword);
                    if (mat.HasProperty(EmissionColorId))
                    {
                        mat.SetColor(EmissionColorId, hdrEmission);
                    }
                }
            }
        }

        private void RestoreInactiveMaterials(HashSet<Material> activeMaterials)
        {
            _staleMaterialsBuffer.Clear();

            foreach (KeyValuePair<Material, MaterialEmissionSnapshot> kvp in _cachedMaterials)
            {
                if (kvp.Key == null || !activeMaterials.Contains(kvp.Key))
                {
                    _staleMaterialsBuffer.Add(kvp.Key);
                }
            }

            for (int i = 0; i < _staleMaterialsBuffer.Count; i++)
            {
                Material mat = _staleMaterialsBuffer[i];
                if (mat != null && _cachedMaterials.TryGetValue(mat, out MaterialEmissionSnapshot snapshot))
                {
                    RestoreMaterial(mat, snapshot);
                }

                _cachedMaterials.Remove(mat);
            }
        }

        private void RestoreAllMaterials()
        {
            foreach (KeyValuePair<Material, MaterialEmissionSnapshot> kvp in _cachedMaterials)
            {
                if (kvp.Key != null)
                {
                    RestoreMaterial(kvp.Key, kvp.Value);
                }
            }

            _cachedMaterials.Clear();
        }

        private static void RestoreMaterial(Material mat, MaterialEmissionSnapshot snapshot)
        {
            if (snapshot.HasEmissionProperty && mat.HasProperty(EmissionColorId))
            {
                mat.SetColor(EmissionColorId, snapshot.OriginalEmissionColor);
            }

            if (snapshot.HadEmissionKeyword)
            {
                mat.EnableKeyword(EmissionKeyword);
            }
            else
            {
                mat.DisableKeyword(EmissionKeyword);
            }
        }
    }
}
