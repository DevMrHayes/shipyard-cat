using System;
using System.Collections.Generic;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace ShipyardCat.Core
{
    /// <summary>
    /// Centralized audio manager handling dual-AudioSource BGM crossfading
    /// between Shipyard Yard themes and the Kingpin Boss theme, plus 2D/3D SFX playback.
    /// </summary>
    public class ShipyardAudioManager : MonoBehaviour
    {
        public static ShipyardAudioManager Instance { get; private set; }

        [Header("BGM Clips")]
        [SerializeField] private AudioClip yardClip;
        [SerializeField] private AudioClip nightYardClip;
        [SerializeField] private AudioClip bossClip;

        [Header("Mix & Crossfade")]
        [SerializeField, Range(0f, 1f)] private float bgmVolume = 0.45f;
        [SerializeField, Range(0f, 1f)] private float sfxVolume = 0.8f;
        [SerializeField, Min(0.1f)] private float crossfadeDuration = 1.5f;

        private AudioSource _yardBgmSource;
        private AudioSource _bossBgmSource;
        private AudioSource _sfx2DSource;
        private readonly List<AudioSource> _sfx3DPool = new List<AudioSource>();
        private readonly Dictionary<string, AudioClip> _sfxCache = new Dictionary<string, AudioClip>(StringComparer.OrdinalIgnoreCase);

        private bool _isNightShift;
        private bool _isBossBgmActive;
        private float _bossBlend;

        private const int ProceduralSampleRate = 22050;
        private const int SfxPoolSize = 8;

        public bool IsBossBgmActive => _isBossBgmActive;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            if (transform.parent == null)
            {
                DontDestroyOnLoad(gameObject);
            }

            InitializeAudioSources();
            LoadOrCreateBgmClips();
            PrewarmSfxCache();
        }

        private void Start()
        {
            PlayYardBGM(_isNightShift);
        }

        private void Update()
        {
            UpdateBgmCrossfade();
        }

        /// <summary>
        /// Plays or switches the shipyard background music based on shift period.
        /// </summary>
        public void PlayYardBGM(bool isNightShift)
        {
            _isNightShift = isNightShift;

            AudioClip targetClip = isNightShift
                ? (nightYardClip != null ? nightYardClip : yardClip)
                : (yardClip != null ? yardClip : nightYardClip);

            if (targetClip == null)
            {
                targetClip = CreateProceduralYardClip(isNightShift);
                if (isNightShift)
                {
                    nightYardClip = targetClip;
                }
                else
                {
                    yardClip = targetClip;
                }
            }

            if (_yardBgmSource.clip != targetClip)
            {
                bool wasPlaying = _yardBgmSource.isPlaying;
                _yardBgmSource.clip = targetClip;
                if (wasPlaying || !_isBossBgmActive)
                {
                    _yardBgmSource.Play();
                }
            }
            else if (!_yardBgmSource.isPlaying && !_isBossBgmActive)
            {
                _yardBgmSource.Play();
            }
        }

        /// <summary>
        /// Smoothly crossfades between the yard BGM and Kingpin Boss BGM ("Titan_s_Gantry").
        /// </summary>
        public void TriggerBossBGM(bool active)
        {
            if (_isBossBgmActive == active)
            {
                return;
            }

            _isBossBgmActive = active;

            if (active)
            {
                if (bossClip == null)
                {
                    bossClip = CreateProceduralBossClip();
                }

                if (_bossBgmSource.clip != bossClip)
                {
                    _bossBgmSource.clip = bossClip;
                }

                if (!_bossBgmSource.isPlaying)
                {
                    _bossBgmSource.Play();
                }
            }
            else
            {
                if (_yardBgmSource.clip == null)
                {
                    PlayYardBGM(_isNightShift);
                }
                else if (!_yardBgmSource.isPlaying)
                {
                    _yardBgmSource.Play();
                }
            }
        }

        /// <summary>
        /// Plays a named sound effect ("Meow", "Swipe", "Pounce", "Sonar", "RatSqueak", "BossRoar", "Victory").
        /// Plays in 3D space if a non-default worldPos is provided, otherwise plays as 2D UI/player audio.
        /// </summary>
        public void PlaySFX(string sfxName, Vector3 worldPos = default)
        {
            if (string.IsNullOrWhiteSpace(sfxName))
            {
                return;
            }

            AudioClip clip = GetOrLoadSfxClip(sfxName);
            if (clip == null)
            {
                return;
            }

            if (worldPos == default)
            {
                _sfx2DSource.PlayOneShot(clip, sfxVolume);
                return;
            }

            AudioSource source3D = AcquireSfx3DSource();
            source3D.transform.position = worldPos;
            source3D.clip = clip;
            source3D.volume = sfxVolume;
            source3D.pitch = UnityEngine.Random.Range(0.95f, 1.05f);
            source3D.Play();
        }

        private void InitializeAudioSources()
        {
            _yardBgmSource = CreateChildSource("BGM_Yard", loop: true, spatialBlend: 0f);
            _yardBgmSource.volume = bgmVolume;

            _bossBgmSource = CreateChildSource("BGM_Boss", loop: true, spatialBlend: 0f);
            _bossBgmSource.volume = 0f;

            _sfx2DSource = CreateChildSource("SFX_2D", loop: false, spatialBlend: 0f);
            _sfx2DSource.volume = 1f;

            for (int i = 0; i < SfxPoolSize; i++)
            {
                AudioSource poolSource = CreateChildSource($"SFX_3D_{i}", loop: false, spatialBlend: 0.85f);
                poolSource.minDistance = 6f;
                poolSource.maxDistance = 55f;
                poolSource.rolloffMode = AudioRolloffMode.Linear;
                _sfx3DPool.Add(poolSource);
            }
        }

        private AudioSource CreateChildSource(string sourceName, bool loop, float spatialBlend)
        {
            GameObject go = new GameObject(sourceName);
            go.transform.SetParent(transform, false);

            AudioSource source = go.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = spatialBlend;
            return source;
        }

        private AudioSource AcquireSfx3DSource()
        {
            for (int i = 0; i < _sfx3DPool.Count; i++)
            {
                if (!_sfx3DPool[i].isPlaying)
                {
                    return _sfx3DPool[i];
                }
            }

            return _sfx3DPool[0];
        }

        private void UpdateBgmCrossfade()
        {
            float targetBlend = _isBossBgmActive ? 1f : 0f;
            float speed = 1f / Mathf.Max(0.1f, crossfadeDuration);
            _bossBlend = Mathf.MoveTowards(_bossBlend, targetBlend, speed * Time.unscaledDeltaTime);

            // Equal-power crossfade curve for smooth energy preservation
            float yardWeight = Mathf.Cos(_bossBlend * Mathf.PI * 0.5f);
            float bossWeight = Mathf.Sin(_bossBlend * Mathf.PI * 0.5f);

            _yardBgmSource.volume = yardWeight * bgmVolume;
            _bossBgmSource.volume = bossWeight * bgmVolume;

            if (!_isBossBgmActive && _bossBlend <= 0.001f && _bossBgmSource.isPlaying)
            {
                _bossBgmSource.Pause();
            }

            if (_isBossBgmActive && _bossBlend >= 0.999f && _yardBgmSource.isPlaying)
            {
                _yardBgmSource.Pause();
            }
        }

        private void LoadOrCreateBgmClips()
        {
            if (yardClip == null)
            {
                yardClip = LoadAudioClipByNames("Paws_at_the_Pier", "Industrial_Catwalk");
                if (yardClip == null)
                {
                    yardClip = CreateProceduralYardClip(isNight: false);
                }
            }

            if (nightYardClip == null)
            {
                nightYardClip = LoadAudioClipByNames("Steel_Horizons", "Industrial_Catwalk");
                if (nightYardClip == null)
                {
                    nightYardClip = CreateProceduralYardClip(isNight: true);
                }
            }

            if (bossClip == null)
            {
                bossClip = LoadAudioClipByNames("Titan_s_Gantry");
                if (bossClip == null)
                {
                    bossClip = CreateProceduralBossClip();
                }
            }
        }

        private void PrewarmSfxCache()
        {
            string[] defaultSfx = { "Meow", "Swipe", "Pounce", "Sonar", "RatSqueak", "BossRoar", "Victory" };
            for (int i = 0; i < defaultSfx.Length; i++)
            {
                GetOrLoadSfxClip(defaultSfx[i]);
            }
        }

        private AudioClip GetOrLoadSfxClip(string sfxName)
        {
            if (_sfxCache.TryGetValue(sfxName, out AudioClip cached) && cached != null)
            {
                return cached;
            }

            AudioClip loaded = LoadAudioClipByNames(sfxName);
            if (loaded == null)
            {
                loaded = CreateProceduralSfxClip(sfxName);
            }

            _sfxCache[sfxName] = loaded;
            return loaded;
        }

        private static AudioClip LoadAudioClipByNames(params string[] candidateNames)
        {
            for (int i = 0; i < candidateNames.Length; i++)
            {
                string clipName = candidateNames[i];
                if (string.IsNullOrEmpty(clipName))
                {
                    continue;
                }

                AudioClip clip = Resources.Load<AudioClip>($"Audio/{clipName}");
                if (clip != null) return clip;

                clip = Resources.Load<AudioClip>($"Audio/SFX/{clipName}");
                if (clip != null) return clip;

                clip = Resources.Load<AudioClip>(clipName);
                if (clip != null) return clip;

#if UNITY_EDITOR
                string[] extensions = { ".mp3", ".wav", ".ogg", ".aiff" };
                for (int e = 0; e < extensions.Length; e++)
                {
                    string path = $"Assets/Audio/{clipName}{extensions[e]}";
                    clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
                    if (clip != null) return clip;

                    string sfxPath = $"Assets/Audio/SFX/{clipName}{extensions[e]}";
                    clip = AssetDatabase.LoadAssetAtPath<AudioClip>(sfxPath);
                    if (clip != null) return clip;
                }
#endif
            }

            return null;
        }

        private static AudioClip CreateProceduralYardClip(bool isNight)
        {
            const float duration = 4.0f;
            int sampleCount = Mathf.RoundToInt(ProceduralSampleRate * duration);
            float[] samples = new float[sampleCount];

            float rootFreq = isNight ? 110f : 130.81f; // A2 (night) or C3 (day)
            float fifthFreq = rootFreq * 1.5f;
            float seventhFreq = rootFreq * (isNight ? 1.78f : 1.875f);

            for (int i = 0; i < sampleCount; i++)
            {
                float t = (float)i / ProceduralSampleRate;
                float lfo = 0.5f + 0.5f * Mathf.Sin(2f * Mathf.PI * 0.25f * t);
                float pad = Mathf.Sin(2f * Mathf.PI * rootFreq * t) * 0.35f
                          + Mathf.Sin(2f * Mathf.PI * fifthFreq * t) * 0.20f
                          + Mathf.Sin(2f * Mathf.PI * seventhFreq * t) * (0.12f * lfo);

                // Subtle harbor pulse every 0.5s
                float beatPhase = (t * 2f) % 1f;
                float pulse = Mathf.Exp(-beatPhase * 8f) * Mathf.Sin(2f * Mathf.PI * (rootFreq * 0.5f) * t) * 0.2f;

                samples[i] = Mathf.Clamp((pad + pulse) * 0.4f, -0.95f, 0.95f);
            }

            ApplyLoopCrossfade(samples, ProceduralSampleRate / 20);
            AudioClip clip = AudioClip.Create(isNight ? "Procedural_YardNight" : "Procedural_YardDay", sampleCount, 1, ProceduralSampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private static AudioClip CreateProceduralBossClip()
        {
            const float duration = 4.0f;
            int sampleCount = Mathf.RoundToInt(ProceduralSampleRate * duration);
            float[] samples = new float[sampleCount];

            for (int i = 0; i < sampleCount; i++)
            {
                float t = (float)i / ProceduralSampleRate;
                float beatPhase = (t * 2.5f) % 1f;
                float subBass = Mathf.Exp(-beatPhase * 6f) * Mathf.Sin(2f * Mathf.PI * 65.41f * t) * 0.55f;

                // Driving industrial saw-like harmonic stack
                float step = (Mathf.Floor(t * 5f) % 4f);
                float riffFreq = step < 2f ? 98f : (step < 3f ? 116.54f : 92.5f);
                float lead = (Mathf.Sin(2f * Mathf.PI * riffFreq * t)
                            + 0.5f * Mathf.Sin(2f * Mathf.PI * riffFreq * 2f * t)
                            + 0.25f * Mathf.Sin(2f * Mathf.PI * riffFreq * 3f * t)) * 0.22f;

                samples[i] = Mathf.Clamp((subBass + lead) * 0.5f, -0.95f, 0.95f);
            }

            ApplyLoopCrossfade(samples, ProceduralSampleRate / 20);
            AudioClip clip = AudioClip.Create("Procedural_BossBGM", sampleCount, 1, ProceduralSampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private static AudioClip CreateProceduralSfxClip(string sfxName)
        {
            string key = sfxName.Trim().ToLowerInvariant();
            float duration = 0.35f;
            switch (key)
            {
                case "meow": duration = 0.42f; break;
                case "swipe": duration = 0.18f; break;
                case "pounce": duration = 0.32f; break;
                case "sonar": duration = 0.65f; break;
                case "ratsqueak": duration = 0.22f; break;
                case "bossroar": duration = 0.85f; break;
                case "victory": duration = 1.10f; break;
            }

            int sampleCount = Mathf.Max(256, Mathf.RoundToInt(ProceduralSampleRate * duration));
            float[] samples = new float[sampleCount];
            System.Random rng = new System.Random(key.GetHashCode());

            for (int i = 0; i < sampleCount; i++)
            {
                float norm = (float)i / sampleCount;
                float t = (float)i / ProceduralSampleRate;
                float env = Mathf.Sin(Mathf.PI * Mathf.Clamp01(norm)) * Mathf.Exp(-norm * 2.2f);
                float val = 0f;

                switch (key)
                {
                    case "meow":
                    {
                        float freq = Mathf.Lerp(520f, 820f, Mathf.Sin(norm * Mathf.PI)) - norm * 160f;
                        val = (Mathf.Sin(2f * Mathf.PI * freq * t) + 0.35f * Mathf.Sin(4f * Mathf.PI * freq * t)) * env;
                        break;
                    }
                    case "swipe":
                    {
                        float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                        float sweep = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(900f, 260f, norm) * t);
                        val = (noise * 0.6f + sweep * 0.4f) * Mathf.Exp(-norm * 6f);
                        break;
                    }
                    case "pounce":
                    {
                        float freq = Mathf.Lerp(320f, 110f, norm);
                        val = Mathf.Sin(2f * Mathf.PI * freq * t) * Mathf.Exp(-norm * 4f);
                        break;
                    }
                    case "sonar":
                    {
                        float ping = Mathf.Sin(2f * Mathf.PI * 1320f * t) + 0.3f * Mathf.Sin(2f * Mathf.PI * 2640f * t);
                        val = ping * Mathf.Exp(-norm * 4.5f) * 0.7f;
                        break;
                    }
                    case "ratsqueak":
                    {
                        float freq = Mathf.Lerp(1750f, 2400f, Mathf.Sin(norm * Mathf.PI));
                        val = Mathf.Sin(2f * Mathf.PI * freq * t) * Mathf.Exp(-norm * 5f);
                        break;
                    }
                    case "bossroar":
                    {
                        float noise = (float)(rng.NextDouble() * 2.0 - 1.0) * 0.35f;
                        float growl = Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(115f, 58f, norm) * t)
                                    + 0.5f * Mathf.Sin(2f * Mathf.PI * 172f * t);
                        val = (growl * 0.65f + noise) * Mathf.Sin(Mathf.PI * norm);
                        break;
                    }
                    case "victory":
                    {
                        float chordFreq = norm < 0.33f ? 523.25f : (norm < 0.66f ? 659.25f : 783.99f);
                        val = (Mathf.Sin(2f * Mathf.PI * chordFreq * t) + 0.4f * Mathf.Sin(2f * Mathf.PI * 523.25f * t))
                            * (1f - norm * 0.5f);
                        break;
                    }
                    default:
                    {
                        val = Mathf.Sin(2f * Mathf.PI * 440f * t) * Mathf.Exp(-norm * 5f);
                        break;
                    }
                }

                samples[i] = Mathf.Clamp(val * 0.75f, -0.95f, 0.95f);
            }

            AudioClip clip = AudioClip.Create($"Procedural_SFX_{sfxName}", sampleCount, 1, ProceduralSampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private static void ApplyLoopCrossfade(float[] samples, int fadeSamples)
        {
            int count = Mathf.Min(fadeSamples, samples.Length / 4);
            for (int i = 0; i < count; i++)
            {
                float alpha = (float)i / count;
                samples[i] *= alpha;
                samples[samples.Length - 1 - i] *= alpha;
            }
        }
    }
}
