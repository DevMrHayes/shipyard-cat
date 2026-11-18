using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using ShipyardCat.Core;

namespace ShipyardCat.World
{
    public class DiurnalShiftManager : MonoBehaviour
    {
        public static DiurnalShiftManager Instance { get; private set; }

        [Serializable]
        private struct FloodlightEntry
        {
            public Light light;
            public Renderer bulbRenderer;
        }

        [Header("Clock Settings")]
        [SerializeField, Range(0f, 24f)] private float startTimeOfDay = 7.0f;
        [SerializeField] private float dayLengthInMinutes = 12.0f;
        [SerializeField] private bool advanceTimeAutomatically = true;

        [Header("Lighting & Fog References")]
        [SerializeField] private Light sunLight;
        [SerializeField] private Light[] floodlights = Array.Empty<Light>();

        [Header("Fog Density Profile")]
        [SerializeField] private float dayFogDensity = 0.0022f;
        [SerializeField] private float duskFogDensity = 0.0048f;
        [SerializeField] private float nightFogDensity = 0.0075f;

        [Header("Light Intensity Profile")]
        [SerializeField] private float daySunIntensity = 1.35f;
        [SerializeField] private float duskSunIntensity = 0.80f;
        [SerializeField] private float nightMoonIntensity = 0.30f;
        [SerializeField] private float floodlightIntensity = 6.5f;

        public float TimeOfDay { get; private set; } = 7.0f;
        public ShiftPeriod CurrentShift { get; private set; } = ShiftPeriod.FirstShift_Day;
        public bool IsNight => TimeOfDay >= 18.0f || TimeOfDay < 6.0f;

        public string CurrentTimeString
        {
            get
            {
                int totalMinutes = Mathf.FloorToInt(TimeOfDay * 60f) % 1440;
                if (totalMinutes < 0)
                {
                    totalMinutes += 1440;
                }

                int hours = totalMinutes / 60;
                int minutes = totalMinutes % 60;
                return $"{hours:00}:{minutes:00}";
            }
        }

        public string CurrentShiftLabel => CurrentShift switch
        {
            ShiftPeriod.FirstShift_Day => "1st Shift (Day)",
            ShiftPeriod.SecondShift_Dusk => "2nd Shift (Dusk)",
            ShiftPeriod.ThirdShift_Night => "3rd Shift (Night)",
            _ => "1st Shift (Day)"
        };

        public string FormattedShiftName => CurrentShiftLabel;

        public event Action<ShiftPeriod, float> OnShiftUpdated;

        private readonly List<FloodlightEntry> _registeredFloodlights = new List<FloodlightEntry>();
        private MaterialPropertyBlock _bulbPropertyBlock;
        private static readonly int EmissionColorPropertyId = Shader.PropertyToID("_EmissionColor");

        private Color _dayFogColor;
        private Color _duskFogColor;
        private Color _nightFogColor;
        private Color _daySunColor;
        private Color _duskSunColor;
        private Color _nightMoonColor;
        private Color _dayAmbientColor;
        private Color _duskAmbientColor;
        private Color _nightAmbientColor;
        private Color _floodlightColor;

        private bool _lastNightState;
        private int _lastNotifiedMinute = -1;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            InitializePaletteColors();
            ResolveSunLight();
            SyncSerializedFloodlights();

            TimeOfDay = Mathf.Repeat(startTimeOfDay, 24f);
            CurrentShift = EvaluateShiftPeriod(TimeOfDay);
            _lastNightState = IsNight;

            ApplyEnvironmentState(forceFloodlights: true);
        }

        private void Start()
        {
            if (ShipyardAudioManager.Instance != null)
            {
                ShipyardAudioManager.Instance.PlayYardBGM(IsNight);
            }

            _lastNotifiedMinute = Mathf.FloorToInt(TimeOfDay * 60f);
            OnShiftUpdated?.Invoke(CurrentShift, TimeOfDay);
        }

        private void Update()
        {
            if (!advanceTimeAutomatically || dayLengthInMinutes <= 0.001f)
            {
                return;
            }

            float hoursPerSecond = 24f / (dayLengthInMinutes * 60f);
            AdvanceClock(hoursPerSecond * Time.deltaTime);
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        public void ToggleNightShift()
        {
            float targetHour = IsNight ? 7.0f : 20.0f;
            SetTimeOfDay(targetHour);
        }

        public void SetTimeOfDay(float hour24)
        {
            TimeOfDay = Mathf.Repeat(hour24, 24f);
            CurrentShift = EvaluateShiftPeriod(TimeOfDay);

            bool nightChanged = IsNight != _lastNightState;
            _lastNightState = IsNight;

            ApplyEnvironmentState(forceFloodlights: true);

            if (nightChanged && Application.isPlaying && ShipyardAudioManager.Instance != null)
            {
                ShipyardAudioManager.Instance.PlayYardBGM(IsNight);
            }

            _lastNotifiedMinute = Mathf.FloorToInt(TimeOfDay * 60f);
            OnShiftUpdated?.Invoke(CurrentShift, TimeOfDay);
        }

        public void RegisterFloodlight(Light floodlight, Renderer bulbRenderer = null)
        {
            if (floodlight == null)
            {
                return;
            }

            for (int i = 0; i < _registeredFloodlights.Count; i++)
            {
                if (_registeredFloodlights[i].light == floodlight)
                {
                    if (bulbRenderer != null && _registeredFloodlights[i].bulbRenderer == null)
                    {
                        _registeredFloodlights[i] = new FloodlightEntry
                        {
                            light = floodlight,
                            bulbRenderer = bulbRenderer
                        };
                        ApplyFloodlightEntry(_registeredFloodlights[i], IsNight);
                    }
                    return;
                }
            }

            FloodlightEntry entry = new FloodlightEntry
            {
                light = floodlight,
                bulbRenderer = bulbRenderer
            };
            _registeredFloodlights.Add(entry);
            SyncFloodlightArraySnapshot();
            ApplyFloodlightEntry(entry, IsNight);
        }

        private void AdvanceClock(float deltaHours)
        {
            TimeOfDay = Mathf.Repeat(TimeOfDay + deltaHours, 24f);
            ShiftPeriod newShift = EvaluateShiftPeriod(TimeOfDay);
            bool shiftChanged = newShift != CurrentShift;
            CurrentShift = newShift;

            bool nightChanged = IsNight != _lastNightState;
            if (nightChanged)
            {
                _lastNightState = IsNight;
                if (ShipyardAudioManager.Instance != null)
                {
                    ShipyardAudioManager.Instance.PlayYardBGM(IsNight);
                }
            }

            ApplyEnvironmentState(forceFloodlights: nightChanged);

            int currentMinute = Mathf.FloorToInt(TimeOfDay * 60f);
            if (shiftChanged || nightChanged || currentMinute != _lastNotifiedMinute)
            {
                _lastNotifiedMinute = currentMinute;
                OnShiftUpdated?.Invoke(CurrentShift, TimeOfDay);
            }
        }

        private static ShiftPeriod EvaluateShiftPeriod(float hour)
        {
            if (hour >= 18.0f || hour < 6.0f)
            {
                return ShiftPeriod.ThirdShift_Night;
            }

            if (hour >= 16.0f)
            {
                return ShiftPeriod.SecondShift_Dusk;
            }

            return ShiftPeriod.FirstShift_Day;
        }

        private void ApplyEnvironmentState(bool forceFloodlights)
        {
            EvaluateAtmosphericProfile(
                TimeOfDay,
                out Color fogColor,
                out float fogDensity,
                out Color sunColor,
                out float sunIntensity,
                out Color ambientColor
            );

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = fogColor;
            RenderSettings.fogDensity = fogDensity;
            RenderSettings.ambientLight = ambientColor;

            var mainCam = Camera.main;
            if (mainCam != null)
            {
                mainCam.clearFlags = IsNight ? CameraClearFlags.SolidColor : CameraClearFlags.Skybox;
                mainCam.backgroundColor = fogColor;
            }

            if (sunLight != null)
            {
                sunLight.color = sunColor;
                sunLight.intensity = sunIntensity;
                sunLight.transform.rotation = CalculateDirectionalLightRotation(TimeOfDay);
            }

            if (forceFloodlights)
            {
                bool nightActive = IsNight;
                for (int i = 0; i < _registeredFloodlights.Count; i++)
                {
                    ApplyFloodlightEntry(_registeredFloodlights[i], nightActive);
                }
            }
        }

        private void EvaluateAtmosphericProfile(
            float hour,
            out Color fogColor,
            out float fogDensity,
            out Color sunColor,
            out float sunIntensity,
            out Color ambientColor)
        {
            if (hour >= 5.5f && hour < 7.5f)
            {
                float t = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(5.5f, 7.5f, hour));
                fogColor = Color.Lerp(_nightFogColor, _dayFogColor, t);
                fogDensity = Mathf.Lerp(nightFogDensity, dayFogDensity, t);
                sunColor = Color.Lerp(_nightMoonColor, _daySunColor, t);
                sunIntensity = Mathf.Lerp(nightMoonIntensity, daySunIntensity, t);
                ambientColor = Color.Lerp(_nightAmbientColor, _dayAmbientColor, t);
            }
            else if (hour >= 7.5f && hour < 15.5f)
            {
                fogColor = _dayFogColor;
                fogDensity = dayFogDensity;
                sunColor = _daySunColor;
                sunIntensity = daySunIntensity;
                ambientColor = _dayAmbientColor;
            }
            else if (hour >= 15.5f && hour < 17.5f)
            {
                float t = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(15.5f, 17.5f, hour));
                fogColor = Color.Lerp(_dayFogColor, _duskFogColor, t);
                fogDensity = Mathf.Lerp(dayFogDensity, duskFogDensity, t);
                sunColor = Color.Lerp(_daySunColor, _duskSunColor, t);
                sunIntensity = Mathf.Lerp(daySunIntensity, duskSunIntensity, t);
                ambientColor = Color.Lerp(_dayAmbientColor, _duskAmbientColor, t);
            }
            else if (hour >= 17.5f && hour < 19.0f)
            {
                float t = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(17.5f, 19.0f, hour));
                fogColor = Color.Lerp(_duskFogColor, _nightFogColor, t);
                fogDensity = Mathf.Lerp(duskFogDensity, nightFogDensity, t);
                sunColor = Color.Lerp(_duskSunColor, _nightMoonColor, t);
                sunIntensity = Mathf.Lerp(duskSunIntensity, nightMoonIntensity, t);
                ambientColor = Color.Lerp(_duskAmbientColor, _nightAmbientColor, t);
            }
            else
            {
                fogColor = _nightFogColor;
                fogDensity = nightFogDensity;
                sunColor = _nightMoonColor;
                sunIntensity = nightMoonIntensity;
                ambientColor = _nightAmbientColor;
            }
        }

        private static Quaternion CalculateDirectionalLightRotation(float hour)
        {
            if (hour >= 6.0f && hour < 18.0f)
            {
                float dayProgress = (hour - 6.0f) / 12.0f;
                float pitch = Mathf.Sin(dayProgress * Mathf.PI) * 60f + 8f;
                float yaw = Mathf.Lerp(-65f, 115f, dayProgress);
                return Quaternion.Euler(pitch, yaw, 0f);
            }

            float nightProgress = hour >= 18.0f ? (hour - 18.0f) / 12.0f : (hour + 6.0f) / 12.0f;
            float moonPitch = Mathf.Sin(nightProgress * Mathf.PI) * 36f + 14f;
            float moonYaw = Mathf.Lerp(120f, 240f, nightProgress);
            return Quaternion.Euler(moonPitch, moonYaw, 0f);
        }

        private void ApplyFloodlightEntry(FloodlightEntry entry, bool active)
        {
            if (entry.light != null)
            {
                entry.light.enabled = active;
                if (active)
                {
                    entry.light.color = _floodlightColor;
                    entry.light.intensity = floodlightIntensity;
                }
            }

            if (entry.bulbRenderer != null)
            {
                _bulbPropertyBlock ??= new MaterialPropertyBlock();
                entry.bulbRenderer.GetPropertyBlock(_bulbPropertyBlock);
                _bulbPropertyBlock.SetColor(EmissionColorPropertyId, active ? _floodlightColor * 2.5f : Color.black);
                entry.bulbRenderer.SetPropertyBlock(_bulbPropertyBlock);
            }
        }

        private void ResolveSunLight()
        {
            if (sunLight != null)
            {
                return;
            }

            if (RenderSettings.sun != null)
            {
                sunLight = RenderSettings.sun;
                return;
            }

            Light[] sceneLights = FindObjectsByType<Light>(FindObjectsSortMode.None);
            for (int i = 0; i < sceneLights.Length; i++)
            {
                if (sceneLights[i] != null && sceneLights[i].type == LightType.Directional)
                {
                    sunLight = sceneLights[i];
                    RenderSettings.sun = sunLight;
                    return;
                }
            }
        }

        private void SyncSerializedFloodlights()
        {
            if (floodlights == null)
            {
                return;
            }

            for (int i = 0; i < floodlights.Length; i++)
            {
                if (floodlights[i] != null)
                {
                    RegisterFloodlight(floodlights[i]);
                }
            }
        }

        private void SyncFloodlightArraySnapshot()
        {
            List<Light> validLights = new List<Light>(_registeredFloodlights.Count);
            for (int i = 0; i < _registeredFloodlights.Count; i++)
            {
                if (_registeredFloodlights[i].light != null)
                {
                    validLights.Add(_registeredFloodlights[i].light);
                }
            }

            floodlights = validLights.ToArray();
        }

        private void InitializePaletteColors()
        {
            Type paletteType = FindShipyardPaletteType();

            _dayFogColor = ResolvePaletteColor(
                paletteType,
                new Color(0.64f, 0.74f, 0.81f, 1f),
                "DayFog", "FogDay", "DayFogColor", "MarineFogDay", "SkyDay"
            );

            _duskFogColor = ResolvePaletteColor(
                paletteType,
                new Color(0.56f, 0.39f, 0.34f, 1f),
                "DuskFog", "FogDusk", "DuskFogColor", "SunsetFog", "TwilightFog"
            );

            _nightFogColor = ResolvePaletteColor(
                paletteType,
                new Color(0.05f, 0.09f, 0.16f, 1f),
                "NightFog", "FogNight", "NightFogColor", "MarineFogNight", "NavalNight"
            );

            _daySunColor = ResolvePaletteColor(
                paletteType,
                new Color(1.00f, 0.96f, 0.88f, 1f),
                "DaySun", "SunDay", "DayLightColor", "SunWarm"
            );

            _duskSunColor = ResolvePaletteColor(
                paletteType,
                new Color(0.98f, 0.58f, 0.32f, 1f),
                "DuskSun", "SunDusk", "DuskLightColor", "IndustrialAmber", "SunsetAmber"
            );

            _nightMoonColor = ResolvePaletteColor(
                paletteType,
                new Color(0.45f, 0.62f, 0.86f, 1f),
                "NightMoon", "MoonLight", "NightLightColor", "MoonBlue"
            );

            _dayAmbientColor = ResolvePaletteColor(
                paletteType,
                new Color(0.36f, 0.42f, 0.48f, 1f),
                "DayAmbient", "AmbientDay"
            );

            _duskAmbientColor = ResolvePaletteColor(
                paletteType,
                new Color(0.30f, 0.24f, 0.26f, 1f),
                "DuskAmbient", "AmbientDusk"
            );

            _nightAmbientColor = ResolvePaletteColor(
                paletteType,
                new Color(0.08f, 0.13f, 0.22f, 1f),
                "NightAmbient", "AmbientNight"
            );

            _floodlightColor = ResolvePaletteColor(
                paletteType,
                new Color(1.00f, 0.82f, 0.48f, 1f),
                "FloodlightAmber", "Floodlight", "FloodlightColor", "IndustrialAmber", "SafetyAmber"
            );
        }

        private static Type FindShipyardPaletteType()
        {
            const string paletteFullName = "ShipyardCat.Core.ShipyardPalette";
            Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
            for (int i = 0; i < assemblies.Length; i++)
            {
                Type type = assemblies[i].GetType(paletteFullName, throwOnError: false);
                if (type != null)
                {
                    return type;
                }
            }

            return null;
        }

        private static Color ResolvePaletteColor(Type paletteType, Color fallback, params string[] candidateMemberNames)
        {
            if (paletteType == null || candidateMemberNames == null)
            {
                return fallback;
            }

            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
            for (int i = 0; i < candidateMemberNames.Length; i++)
            {
                string memberName = candidateMemberNames[i];

                PropertyInfo property = paletteType.GetProperty(memberName, flags);
                if (property != null && property.PropertyType == typeof(Color) && property.CanRead)
                {
                    return (Color)property.GetValue(null);
                }

                FieldInfo field = paletteType.GetField(memberName, flags);
                if (field != null && field.FieldType == typeof(Color))
                {
                    return (Color)field.GetValue(null);
                }
            }

            return fallback;
        }
    }
}
