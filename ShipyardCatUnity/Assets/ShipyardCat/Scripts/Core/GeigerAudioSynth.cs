using UnityEngine;
using ShipyardCat.Player;

namespace ShipyardCat.Core
{
    [RequireComponent(typeof(AudioSource))]
    public class GeigerAudioSynth : MonoBehaviour
    {
        private const float ClipDurationSeconds = 0.018f;
        private const float MinRateHz = 0.5f;
        private const float MaxRateHz = 24f;
        private const float DefaultSfxVolume = 0.85f;

        [SerializeField] private CatVitals vitals;
        [SerializeField, Range(0f, 1f)] private float clickGain = 0.8f;

        private AudioSource _audioSource;
        private AudioClip _clickClip;
        private float _timeUntilNextClick;

        private void Awake()
        {
            _audioSource = GetComponent<AudioSource>();
            _audioSource.playOnAwake = false;
            _audioSource.loop = false;

            if (vitals == null)
            {
                vitals = GetComponent<CatVitals>();
                if (vitals == null)
                {
                    vitals = FindFirstObjectByType<CatVitals>();
                }
            }

            _clickClip = SynthesizeGeigerClick();
            _timeUntilNextClick = SamplePoissonInterval(MinRateHz);
        }

        private void Update()
        {
            if (_clickClip == null || _audioSource == null)
            {
                return;
            }

            float normalizedRadiation = 0f;
            if (vitals != null)
            {
                normalizedRadiation = Mathf.Clamp01(vitals.Radiation / Mathf.Max(1f, vitals.MaxRadiation));
            }

            float rateHz = Mathf.Lerp(MinRateHz, MaxRateHz, normalizedRadiation);

            // Prevent stale long baseline intervals from delaying high-radiation feedback.
            float maxWait = 3f / rateHz;
            if (_timeUntilNextClick > maxWait)
            {
                _timeUntilNextClick = SamplePoissonInterval(rateHz);
            }

            _timeUntilNextClick -= Time.deltaTime;
            if (_timeUntilNextClick <= 0f)
            {
                PlayClick(normalizedRadiation);
                _timeUntilNextClick = SamplePoissonInterval(rateHz);
            }
        }

        private void OnDestroy()
        {
            if (_clickClip != null)
            {
                Destroy(_clickClip);
                _clickClip = null;
            }
        }

        private void PlayClick(float normalizedRadiation)
        {
            float sfxVolume = GameShellController.Instance != null
                ? GameShellController.Instance.SfxVolume
                : DefaultSfxVolume;

            float volume = Mathf.Clamp01(sfxVolume) * clickGain * Random.Range(0.75f, 1.0f);
            if (volume <= 0.0001f)
            {
                return;
            }

            _audioSource.pitch = Random.Range(0.94f, 1.06f) + normalizedRadiation * 0.04f;
            _audioSource.PlayOneShot(_clickClip, volume);
        }

        private static float SamplePoissonInterval(float rateHz)
        {
            float safeRate = Mathf.Max(0.01f, rateHz);
            float u = Mathf.Clamp(Random.value, 0.0001f, 1f);
            return -Mathf.Log(u) / safeRate;
        }

        private static AudioClip SynthesizeGeigerClick()
        {
            int sampleRate = AudioSettings.outputSampleRate > 0 ? AudioSettings.outputSampleRate : 44100;
            int sampleCount = Mathf.Max(1, Mathf.RoundToInt(sampleRate * ClipDurationSeconds));
            float[] samples = new float[sampleCount];

            // Deterministic pseudo-random state for consistent crisp transient texture.
            uint rngState = 0x5A17C0DEu;

            for (int i = 0; i < sampleCount; i++)
            {
                float t = (float)i / sampleRate;
                float progress = (float)i / (sampleCount - 1);

                // Fast initial discharge transient + damped high-frequency resonance.
                float fastEnvelope = Mathf.Exp(-t * 850f);
                float bodyEnvelope = Mathf.Exp(-t * 260f);

                float carrier = Mathf.Sin(2f * Mathf.PI * 3400f * t) * 0.65f
                              + Mathf.Sin(2f * Mathf.PI * 6900f * t) * 0.35f;

                rngState = rngState * 1664525u + 1013904223u;
                float noise = ((rngState >> 8) / (float)0x00FFFFFF) * 2f - 1f;

                float impulse = i < 4 ? (1f - i * 0.2f) * 0.9f : 0f;
                float sample = impulse + (carrier * bodyEnvelope * 0.65f) + (noise * fastEnvelope * 0.55f);

                // Smooth fade-out over the final 10% to guarantee zero tail pop.
                if (progress > 0.9f)
                {
                    float fade = 1f - ((progress - 0.9f) / 0.1f);
                    sample *= fade;
                }

                samples[i] = Mathf.Clamp(sample, -1f, 1f);
            }

            AudioClip clip = AudioClip.Create("GeigerClick_18ms", sampleCount, 1, sampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
