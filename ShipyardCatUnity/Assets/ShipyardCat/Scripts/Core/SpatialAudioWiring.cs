using System.Collections.Generic;
using UnityEngine;

namespace ShipyardCat.Core
{
    [DisallowMultipleComponent]
    public sealed class SpatialAudioWiring : MonoBehaviour
    {
        [Header("Ambient Wind & River Synthesis")]
        [SerializeField, Range(0f, 1f)] private float ambientBaseVolume = 0.22f;
        [SerializeField, Min(1f)] private float clipDurationSeconds = 8f;
        [SerializeField] private int sampleRate = 22050;
        [SerializeField, Range(60f, 1200f)] private float lowPassCutoffHz = 320f;
        [SerializeField, Range(0f, 1f)] private float swellDepth = 0.25f;

        [Header("3D Spatial SFX Sync")]
        [SerializeField, Min(0.1f)] private float spatialScanInterval = 0.5f;

        private AudioSource _ambientSource;
        private AudioClip _ambientClip;

        private readonly Dictionary<AudioSource, float> _spatialBaseVolumes = new Dictionary<AudioSource, float>();
        private readonly List<AudioSource> _cleanupBuffer = new List<AudioSource>();
        private float _nextScanTime;
        private float _lastAppliedSfxVolume = -1f;

        private void Awake()
        {
            _ambientClip = CreateAmbientWindRiverClip();

            _ambientSource = gameObject.AddComponent<AudioSource>();
            _ambientSource.clip = _ambientClip;
            _ambientSource.loop = true;
            _ambientSource.playOnAwake = false;
            _ambientSource.spatialBlend = 0f;
            _ambientSource.dopplerLevel = 0f;
            _ambientSource.priority = 64;

            float musicVolume = GameShellController.Instance != null
                ? Mathf.Clamp01(GameShellController.Instance.MusicVolume)
                : 1f;
            _ambientSource.volume = ambientBaseVolume * musicVolume;
            _ambientSource.Play();
        }

        private void Start()
        {
            ScanSpatialAudioSources();
            ApplySpatialSfxVolumes(forceUpdate: true);
        }

        private void Update()
        {
            GameShellController shell = GameShellController.Instance;
            if (shell == null)
            {
                return;
            }

            if (_ambientSource != null)
            {
                _ambientSource.volume = ambientBaseVolume * Mathf.Clamp01(shell.MusicVolume);
            }

            if (Time.unscaledTime >= _nextScanTime)
            {
                _nextScanTime = Time.unscaledTime + spatialScanInterval;
                ScanSpatialAudioSources();
            }

            ApplySpatialSfxVolumes(forceUpdate: false);
        }

        private void OnDestroy()
        {
            if (_ambientClip != null)
            {
                Destroy(_ambientClip);
                _ambientClip = null;
            }
        }

        public void RefreshSpatialSources()
        {
            ScanSpatialAudioSources();
            ApplySpatialSfxVolumes(forceUpdate: true);
        }

        public void RegisterSpatialSource(AudioSource source, float baseVolume = -1f)
        {
            if (source == null || source == _ambientSource || source.spatialBlend <= 0f)
            {
                return;
            }

            float resolvedBase = baseVolume >= 0f ? Mathf.Clamp01(baseVolume) : source.volume;
            _spatialBaseVolumes[source] = resolvedBase;

            if (GameShellController.Instance != null)
            {
                source.volume = resolvedBase * Mathf.Clamp01(GameShellController.Instance.SfxVolume);
            }
        }

        private void ScanSpatialAudioSources()
        {
            _cleanupBuffer.Clear();
            foreach (KeyValuePair<AudioSource, float> entry in _spatialBaseVolumes)
            {
                if (entry.Key == null)
                {
                    _cleanupBuffer.Add(entry.Key);
                }
            }

            for (int i = 0; i < _cleanupBuffer.Count; i++)
            {
                _spatialBaseVolumes.Remove(_cleanupBuffer[i]);
            }

            AudioSource[] allSources = FindObjectsByType<AudioSource>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            float currentSfx = GameShellController.Instance != null
                ? Mathf.Clamp01(GameShellController.Instance.SfxVolume)
                : 1f;

            for (int i = 0; i < allSources.Length; i++)
            {
                AudioSource src = allSources[i];
                if (src == null || src == _ambientSource || src.spatialBlend <= 0f)
                {
                    continue;
                }

                if (!_spatialBaseVolumes.ContainsKey(src))
                {
                    _spatialBaseVolumes[src] = src.volume;
                    src.volume = src.volume * currentSfx;
                }
            }
        }

        private void ApplySpatialSfxVolumes(bool forceUpdate)
        {
            GameShellController shell = GameShellController.Instance;
            if (shell == null)
            {
                return;
            }

            float sfxVolume = Mathf.Clamp01(shell.SfxVolume);
            if (!forceUpdate && Mathf.Approximately(sfxVolume, _lastAppliedSfxVolume))
            {
                return;
            }

            _lastAppliedSfxVolume = sfxVolume;
            _cleanupBuffer.Clear();

            foreach (KeyValuePair<AudioSource, float> entry in _spatialBaseVolumes)
            {
                AudioSource src = entry.Key;
                if (src == null)
                {
                    _cleanupBuffer.Add(src);
                    continue;
                }

                if (src.spatialBlend > 0f)
                {
                    src.volume = entry.Value * sfxVolume;
                }
            }

            for (int i = 0; i < _cleanupBuffer.Count; i++)
            {
                _spatialBaseVolumes.Remove(_cleanupBuffer[i]);
            }
        }

        private AudioClip CreateAmbientWindRiverClip()
        {
            int safeRate = Mathf.Clamp(sampleRate, 8000, 48000);
            int sampleCount = Mathf.Max(safeRate, Mathf.RoundToInt(safeRate * clipDurationSeconds));

            float[] samples = new float[sampleCount];
            System.Random rng = new System.Random(133742);

            for (int i = 0; i < sampleCount; i++)
            {
                float whiteA = (float)(rng.NextDouble() * 2.0 - 1.0);
                float whiteB = (float)(rng.NextDouble() * 2.0 - 1.0);
                samples[i] = (whiteA + whiteB) * 0.5f;
            }

            float rc = 1f / (2f * Mathf.PI * lowPassCutoffHz);
            float dt = 1f / safeRate;
            float alpha = dt / (rc + dt);

            float[] filtered = new float[sampleCount];
            float state1 = 0f;
            float state2 = 0f;

            // Dual circular pass ensures seamless loop continuity across the boundary
            for (int pass = 0; pass < 2; pass++)
            {
                for (int i = 0; i < sampleCount; i++)
                {
                    state1 += alpha * (samples[i] - state1);
                    state2 += alpha * (state1 - state2);
                    filtered[i] = state2;
                }
            }

            float peak = 0.0001f;
            for (int i = 0; i < sampleCount; i++)
            {
                float tNorm = (float)i / sampleCount;
                float swell = 1f - swellDepth * 0.5f * (1f - Mathf.Cos(2f * Mathf.PI * 2f * tNorm));
                float ripple = 1f + 0.12f * Mathf.Sin(2f * Mathf.PI * 5f * tNorm);
                float v = filtered[i] * swell * ripple;
                filtered[i] = v;

                float absV = Mathf.Abs(v);
                if (absV > peak)
                {
                    peak = absV;
                }
            }

            float normScale = 0.45f / peak;
            for (int i = 0; i < sampleCount; i++)
            {
                filtered[i] *= normScale;
            }

            AudioClip clip = AudioClip.Create(
                "ProceduralShipyardWindRiver",
                sampleCount,
                1,
                safeRate,
                false);
            clip.SetData(filtered, 0);
            return clip;
        }
    }
}
