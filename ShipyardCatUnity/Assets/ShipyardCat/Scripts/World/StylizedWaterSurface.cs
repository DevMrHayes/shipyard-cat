using UnityEngine;

namespace ShipyardCat.World
{
    /// <summary>
    /// Animates a URP Lit water plane's _BaseMap UV offset for lightweight river shimmer
    /// and optionally bobs moored vessels in vertical position and roll with zero per-frame allocations.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Renderer))]
    public sealed class StylizedWaterSurface : MonoBehaviour
    {
        private static readonly int BaseMapId = Shader.PropertyToID("_BaseMap");

        [Header("Water Surface UV Scroll")]
        [Tooltip("Primary river flow UV scroll speed (units per second).")]
        [SerializeField] private Vector2 flowSpeed = new Vector2(0.04f, 0.015f);

        [Tooltip("Amplitude of secondary sinusoidal UV shimmer.")]
        [SerializeField] private Vector2 shimmerAmplitude = new Vector2(0.008f, 0.005f);

        [Tooltip("Frequency (Hz-like radians/sec) of the secondary UV shimmer.")]
        [SerializeField] private Vector2 shimmerFrequency = new Vector2(0.9f, 1.3f);

        [Header("Moored Vessel Bobbing")]
        [SerializeField] private Transform[] mooredVessels;

        [Tooltip("Vertical bobbing amplitude in meters.")]
        [SerializeField] private float bobAmplitude = 0.06f;

        [Tooltip("Vertical bobbing speed in radians per second.")]
        [SerializeField] private float bobFrequency = 1.4f;

        [Tooltip("Roll oscillation amplitude in degrees around local forward axis.")]
        [SerializeField] private float rollAmplitudeDegrees = 1.6f;

        [Tooltip("Roll oscillation speed in radians per second.")]
        [SerializeField] private float rollFrequency = 1.05f;

        [Tooltip("Phase offset step applied between consecutive moored vessels.")]
        [SerializeField] private float vesselPhaseStep = 1.15f;

        private Renderer _waterRenderer;
        private Material _waterMaterial;
        private Vector2 _accumulatedFlowOffset;
        private Vector2 _currentUvOffset;

        private Vector3[] _baseLocalPositions;
        private Quaternion[] _baseLocalRotations;
        private float[] _vesselPhases;

        private void Awake()
        {
            _waterRenderer = GetComponent<Renderer>();
            if (_waterRenderer != null)
            {
                _waterMaterial = _waterRenderer.material;
                if (_waterMaterial != null)
                {
                    _accumulatedFlowOffset = _waterMaterial.GetTextureOffset(BaseMapId);
                }
            }

            CacheVesselBaselines();
        }

        private void OnDestroy()
        {
            if (_waterMaterial != null)
            {
                Destroy(_waterMaterial);
                _waterMaterial = null;
            }
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            float elapsed = Time.time;

            UpdateWaterUv(dt, elapsed);
            UpdateMooredVessels(elapsed);
        }

        private void CacheVesselBaselines()
        {
            if (mooredVessels == null || mooredVessels.Length == 0)
            {
                return;
            }

            int count = mooredVessels.Length;
            _baseLocalPositions = new Vector3[count];
            _baseLocalRotations = new Quaternion[count];
            _vesselPhases = new float[count];

            for (int i = 0; i < count; i++)
            {
                Transform vessel = mooredVessels[i];
                if (vessel == null)
                {
                    continue;
                }

                _baseLocalPositions[i] = vessel.localPosition;
                _baseLocalRotations[i] = vessel.localRotation;
                _vesselPhases[i] = i * vesselPhaseStep;
            }
        }

        private void UpdateWaterUv(float deltaTime, float elapsedTime)
        {
            if (_waterMaterial == null)
            {
                return;
            }

            // Wrap accumulated offset to [0, 1) to preserve floating-point precision in long WebGL sessions.
            _accumulatedFlowOffset.x = Mathf.Repeat(_accumulatedFlowOffset.x + flowSpeed.x * deltaTime, 1f);
            _accumulatedFlowOffset.y = Mathf.Repeat(_accumulatedFlowOffset.y + flowSpeed.y * deltaTime, 1f);

            float shimmerX = Mathf.Sin(elapsedTime * shimmerFrequency.x) * shimmerAmplitude.x;
            float shimmerY = Mathf.Cos(elapsedTime * shimmerFrequency.y) * shimmerAmplitude.y;

            _currentUvOffset.x = _accumulatedFlowOffset.x + shimmerX;
            _currentUvOffset.y = _accumulatedFlowOffset.y + shimmerY;

            _waterMaterial.SetTextureOffset(BaseMapId, _currentUvOffset);
        }

        private void UpdateMooredVessels(float elapsedTime)
        {
            if (mooredVessels == null || _baseLocalPositions == null)
            {
                return;
            }

            int count = mooredVessels.Length;
            for (int i = 0; i < count; i++)
            {
                Transform vessel = mooredVessels[i];
                if (vessel == null)
                {
                    continue;
                }

                float phase = _vesselPhases[i];
                float yOffset = Mathf.Sin(elapsedTime * bobFrequency + phase) * bobAmplitude;
                float rollAngle = Mathf.Sin(elapsedTime * rollFrequency + phase * 0.75f) * rollAmplitudeDegrees;

                Vector3 targetPos = _baseLocalPositions[i];
                targetPos.y += yOffset;

                vessel.SetLocalPositionAndRotation(
                    targetPos,
                    _baseLocalRotations[i] * Quaternion.AngleAxis(rollAngle, Vector3.forward));
            }
        }
    }
}
