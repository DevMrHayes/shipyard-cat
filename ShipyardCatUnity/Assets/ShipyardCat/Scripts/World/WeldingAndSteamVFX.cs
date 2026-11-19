using System;
using System.Reflection;
using ShipyardCat.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace ShipyardCat.World
{
    [DisallowMultipleComponent]
    [RequireComponent(typeof(ParticleSystem))]
    public class WeldingAndSteamVFX : MonoBehaviour
    {
        public enum Mode
        {
            WeldingSparks,
            SteamVent
        }

        [Header("VFX Configuration")]
        [SerializeField] private Mode effectMode = Mode.WeldingSparks;
        [SerializeField, Min(0.1f)] private float emissionScale = 1f;
        [SerializeField] private bool playOnAwake = true;

        [Header("Welding Arc Light")]
        [SerializeField] private bool intermittentArc = true;
        [SerializeField, Min(0f)] private float lightBaseIntensity = 4.5f;
        [SerializeField, Min(0.5f)] private float lightRange = 8.5f;
        [SerializeField] private Vector3 lightLocalOffset = new Vector3(0f, 0.12f, 0f);

        private ParticleSystem _particleSystem;
        private ParticleSystemRenderer _particleRenderer;
        private Light _arcLight;
        private Material _runtimeMaterial;
        private Texture2D _runtimeTexture;

        private float _noiseSeed;
        private bool _isPlaying;
        private Color _sparkLightColor;

        public Mode EffectMode => effectMode;

        private void Awake()
        {
            _noiseSeed = UnityEngine.Random.Range(0f, 1000f);
            EnsureComponents();
            Configure();

            if (playOnAwake)
            {
                Play();
            }
            else
            {
                Stop();
            }
        }

        private void OnValidate()
        {
            emissionScale = Mathf.Max(0.1f, emissionScale);
            lightBaseIntensity = Mathf.Max(0f, lightBaseIntensity);
            lightRange = Mathf.Max(0.5f, lightRange);

            if (Application.isPlaying && isActiveAndEnabled && _particleSystem != null)
            {
                Configure();
            }
        }

        private void Update()
        {
            if (!_isPlaying || effectMode != Mode.WeldingSparks || _arcLight == null)
            {
                return;
            }

            float t = Time.time + _noiseSeed;
            bool arcActive = true;

            if (intermittentArc)
            {
                float dutyWave = Mathf.PerlinNoise(t * 0.55f, 1.7f);
                arcActive = dutyWave > 0.34f;
            }

            ParticleSystem.EmissionModule emission = _particleSystem.emission;
            if (emission.enabled != arcActive)
            {
                emission.enabled = arcActive;
            }

            if (!arcActive)
            {
                _arcLight.intensity = Mathf.MoveTowards(_arcLight.intensity, 0f, Time.deltaTime * 45f);
                return;
            }

            float fastFlicker = Mathf.PerlinNoise(t * 28f, 4.3f);
            float microSnap = Mathf.PerlinNoise(t * 53f, 9.1f);
            float intensityFactor = 0.35f + (fastFlicker * 0.65f) + (microSnap > 0.72f ? 0.5f : 0f);

            _arcLight.color = _sparkLightColor;
            _arcLight.range = lightRange;
            _arcLight.intensity = lightBaseIntensity * intensityFactor;
        }

        private void OnDestroy()
        {
            DestroyProceduralAsset(_runtimeMaterial);
            DestroyProceduralAsset(_runtimeTexture);
            _runtimeMaterial = null;
            _runtimeTexture = null;
        }

        public void SetMode(Mode newMode)
        {
            if (effectMode == newMode && _runtimeMaterial != null)
            {
                return;
            }

            effectMode = newMode;
            EnsureComponents();
            Configure();

            if (_isPlaying)
            {
                Play();
            }
        }

        [ContextMenu("Rebuild VFX")]
        public void Configure()
        {
            EnsureComponents();

            if (effectMode == Mode.WeldingSparks)
            {
                ConfigureWeldingSparks();
            }
            else
            {
                ConfigureSteamVent();
            }
        }

        public void Play()
        {
            EnsureComponents();
            _isPlaying = true;

            ParticleSystem.EmissionModule emission = _particleSystem.emission;
            emission.enabled = true;
            _particleSystem.Play(true);

            if (_arcLight != null)
            {
                _arcLight.enabled = effectMode == Mode.WeldingSparks;
            }
        }

        public void Stop()
        {
            EnsureComponents();
            _isPlaying = false;

            ParticleSystem.EmissionModule emission = _particleSystem.emission;
            emission.enabled = false;
            _particleSystem.Stop(true, ParticleSystemStopBehavior.StopEmitting);

            if (_arcLight != null)
            {
                _arcLight.intensity = 0f;
                _arcLight.enabled = false;
            }
        }

        private void EnsureComponents()
        {
            if (_particleSystem == null)
            {
                _particleSystem = GetComponent<ParticleSystem>();
            }

            if (_particleRenderer == null)
            {
                _particleRenderer = GetComponent<ParticleSystemRenderer>();
            }

            if (_arcLight == null)
            {
                Transform existing = transform.Find("WeldingArcLight");
                if (existing != null)
                {
                    _arcLight = existing.GetComponent<Light>();
                }
            }
        }

        private void EnsureArcLight()
        {
            if (_arcLight == null)
            {
                GameObject lightGo = new GameObject("WeldingArcLight");
                lightGo.transform.SetParent(transform, false);
                lightGo.transform.localPosition = lightLocalOffset;
                _arcLight = lightGo.AddComponent<Light>();
            }

            _arcLight.transform.localPosition = lightLocalOffset;
            _arcLight.type = LightType.Point;
            _arcLight.shadows = LightShadows.None;
            _arcLight.range = lightRange;
            _arcLight.color = _sparkLightColor;
            _arcLight.enabled = _isPlaying;
        }

        private void ConfigureWeldingSparks()
        {
            Color coreColor = Color.white;
            Color electricBlue = new Color(0.294f, 0.659f, 1.0f, 1.0f); // #4BA8FF
            Color hotAmber = new Color(1.0f, 0.424f, 0.063f, 0.85f);   // #FF6C10
            Color emberFade = new Color(0.95f, 0.28f, 0.06f, 0f);

            _sparkLightColor = new Color(0.58f, 0.824f, 1.0f, 1f); // 10000K #94D2FF
            lightBaseIntensity = Mathf.Max(lightBaseIntensity, 9.0f);
            lightRange = Mathf.Max(lightRange, 14f);
            EnsureArcLight();

            _particleSystem.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            ParticleSystem.MainModule main = _particleSystem.main;
            main.duration = 2.0f;
            main.loop = true;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.scalingMode = ParticleSystemScalingMode.Local;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.32f, 0.82f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(5.5f, 12.5f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.03f, 0.085f);
            main.startColor = Color.white;
            main.gravityModifier = new ParticleSystem.MinMaxCurve(1.35f);
            main.maxParticles = 55;

            ParticleSystem.EmissionModule emission = _particleSystem.emission;
            emission.enabled = true;
            emission.rateOverTime = new ParticleSystem.MinMaxCurve(34f * emissionScale);
            emission.SetBursts(new[]
            {
                new ParticleSystem.Burst(0.0f, (short)Mathf.Clamp(Mathf.RoundToInt(10 * emissionScale), 4, 24), 1, 0.75f)
            });

            ParticleSystem.ShapeModule shape = _particleSystem.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 36f;
            shape.radius = 0.05f;
            shape.radiusThickness = 1f;

            ParticleSystem.VelocityOverLifetimeModule velocity = _particleSystem.velocityOverLifetime;
            velocity.enabled = false;

            ParticleSystem.NoiseModule noise = _particleSystem.noise;
            noise.enabled = true;
            noise.strength = new ParticleSystem.MinMaxCurve(0.85f);
            noise.frequency = 3.2f;
            noise.scrollSpeed = 2.5f;
            noise.damping = true;
            noise.octaveCount = 1;

            ParticleSystem.CollisionModule collision = _particleSystem.collision;
            collision.enabled = true;
            collision.type = ParticleSystemCollisionType.World;
            collision.mode = ParticleSystemCollisionMode.Collision3D;
            collision.dampen = 0.35f;
            collision.bounce = 0.58f;
            collision.lifetimeLoss = 0.14f;
            collision.minKillSpeed = 0.4f;
            collision.quality = ParticleSystemCollisionQuality.Low;
            collision.collidesWith = Physics.DefaultRaycastLayers;

            Gradient sparkGradient = new Gradient();
            sparkGradient.SetKeys(
                new[]
                {
                    new GradientColorKey(coreColor, 0.0f),
                    new GradientColorKey(electricBlue, 0.22f),
                    new GradientColorKey(hotAmber, 0.68f),
                    new GradientColorKey(emberFade, 1.0f)
                },
                new[]
                {
                    new GradientAlphaKey(1.0f, 0.0f),
                    new GradientAlphaKey(0.95f, 0.50f),
                    new GradientAlphaKey(0.0f, 1.0f)
                });

            ParticleSystem.ColorOverLifetimeModule colorOverLifetime = _particleSystem.colorOverLifetime;
            colorOverLifetime.enabled = true;
            colorOverLifetime.color = new ParticleSystem.MinMaxGradient(sparkGradient);

            AnimationCurve shrinkCurve = new AnimationCurve(
                new Keyframe(0f, 1f),
                new Keyframe(0.7f, 0.65f),
                new Keyframe(1f, 0.1f));
            ParticleSystem.SizeOverLifetimeModule sizeOverLifetime = _particleSystem.sizeOverLifetime;
            sizeOverLifetime.enabled = true;
            sizeOverLifetime.size = new ParticleSystem.MinMaxCurve(1f, shrinkCurve);

            RebuildProceduralMaterial(isAdditive: true, radialHardness: 2.8f);
            _particleRenderer.renderMode = ParticleSystemRenderMode.Stretch;
            _particleRenderer.cameraVelocityScale = 0f;
            _particleRenderer.velocityScale = 0.055f;
            _particleRenderer.lengthScale = 2.1f;
            _particleRenderer.shadowCastingMode = ShadowCastingMode.Off;
            _particleRenderer.receiveShadows = false;
            _particleRenderer.sharedMaterial = _runtimeMaterial;
        }

        private void ConfigureSteamVent()
        {
            if (_arcLight != null)
            {
                _arcLight.intensity = 0f;
                _arcLight.enabled = false;
            }

            Color steamBright = ResolvePaletteColor(
                new Color(0.84f, 0.89f, 0.93f, 1f),
                "SteamWhite", "MistWhite", "FogLight", "SteelHighlight", "OffWhite");
            Color steamCool = ResolvePaletteColor(
                new Color(0.56f, 0.65f, 0.72f, 1f),
                "FogGray", "IndustrialGray", "SteelGray", "HullSlate", "Slate");

            _particleSystem.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            ParticleSystem.MainModule main = _particleSystem.main;
            main.duration = 4.0f;
            main.loop = true;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.scalingMode = ParticleSystemScalingMode.Local;
            main.startLifetime = new ParticleSystem.MinMaxCurve(2.2f, 3.6f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(1.4f, 2.6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.45f, 0.85f);
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            main.startColor = Color.white;
            main.gravityModifier = new ParticleSystem.MinMaxCurve(-0.18f);
            main.maxParticles = 40;

            ParticleSystem.EmissionModule emission = _particleSystem.emission;
            emission.enabled = true;
            emission.rateOverTime = new ParticleSystem.MinMaxCurve(9f * emissionScale);
            emission.SetBursts(Array.Empty<ParticleSystem.Burst>());

            ParticleSystem.ShapeModule shape = _particleSystem.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 14f;
            shape.radius = 0.18f;
            shape.radiusThickness = 0.8f;

            ParticleSystem.VelocityOverLifetimeModule velocity = _particleSystem.velocityOverLifetime;
            velocity.enabled = true;
            velocity.space = ParticleSystemSimulationSpace.World;
            velocity.x = new ParticleSystem.MinMaxCurve(-0.15f, 0.15f);
            velocity.y = new ParticleSystem.MinMaxCurve(0.45f, 0.95f);
            velocity.z = new ParticleSystem.MinMaxCurve(-0.15f, 0.15f);

            ParticleSystem.NoiseModule noise = _particleSystem.noise;
            noise.enabled = true;
            noise.strength = new ParticleSystem.MinMaxCurve(0.65f);
            noise.frequency = 0.45f;
            noise.scrollSpeed = 0.35f;
            noise.damping = true;
            noise.octaveCount = 2;

            ParticleSystem.CollisionModule collision = _particleSystem.collision;
            collision.enabled = false;

            Gradient steamGradient = new Gradient();
            steamGradient.SetKeys(
                new[]
                {
                    new GradientColorKey(steamBright, 0.0f),
                    new GradientColorKey(steamCool, 1.0f)
                },
                new[]
                {
                    new GradientAlphaKey(0.0f, 0.0f),
                    new GradientAlphaKey(0.42f, 0.22f),
                    new GradientAlphaKey(0.24f, 0.65f),
                    new GradientAlphaKey(0.0f, 1.0f)
                });

            ParticleSystem.ColorOverLifetimeModule colorOverLifetime = _particleSystem.colorOverLifetime;
            colorOverLifetime.enabled = true;
            colorOverLifetime.color = new ParticleSystem.MinMaxGradient(steamGradient);

            AnimationCurve expandCurve = new AnimationCurve(
                new Keyframe(0f, 0.45f),
                new Keyframe(0.5f, 1.35f),
                new Keyframe(1f, 2.25f));
            ParticleSystem.SizeOverLifetimeModule sizeOverLifetime = _particleSystem.sizeOverLifetime;
            sizeOverLifetime.enabled = true;
            sizeOverLifetime.size = new ParticleSystem.MinMaxCurve(1f, expandCurve);

            RebuildProceduralMaterial(isAdditive: false, radialHardness: 1.55f);
            _particleRenderer.renderMode = ParticleSystemRenderMode.Billboard;
            _particleRenderer.shadowCastingMode = ShadowCastingMode.Off;
            _particleRenderer.receiveShadows = false;
            _particleRenderer.sharedMaterial = _runtimeMaterial;
        }

        private void RebuildProceduralMaterial(bool isAdditive, float radialHardness)
        {
            DestroyProceduralAsset(_runtimeTexture);
            _runtimeTexture = CreateRadialSoftTexture(64, radialHardness);

            if (_runtimeMaterial == null)
            {
                Shader shader = FindParticleShader();
                _runtimeMaterial = new Material(shader)
                {
                    name = $"Procedural_{effectMode}_Mat",
                    hideFlags = HideFlags.DontSave
                };
            }

            if (_runtimeMaterial.HasProperty("_BaseMap"))
            {
                _runtimeMaterial.SetTexture("_BaseMap", _runtimeTexture);
            }

            if (_runtimeMaterial.HasProperty("_MainTex"))
            {
                _runtimeMaterial.SetTexture("_MainTex", _runtimeTexture);
            }

            if (_runtimeMaterial.HasProperty("_BaseColor"))
            {
                _runtimeMaterial.SetColor("_BaseColor", Color.white);
            }

            if (_runtimeMaterial.HasProperty("_Color"))
            {
                _runtimeMaterial.SetColor("_Color", Color.white);
            }

            if (_runtimeMaterial.HasProperty("_Surface"))
            {
                _runtimeMaterial.SetFloat("_Surface", 1f);
            }

            if (_runtimeMaterial.HasProperty("_Blend"))
            {
                _runtimeMaterial.SetFloat("_Blend", isAdditive ? 2f : 0f);
            }

            if (_runtimeMaterial.HasProperty("_ColorMode"))
            {
                _runtimeMaterial.SetFloat("_ColorMode", 0f);
            }

            if (_runtimeMaterial.HasProperty("_SrcBlend"))
            {
                _runtimeMaterial.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
            }

            if (_runtimeMaterial.HasProperty("_DstBlend"))
            {
                _runtimeMaterial.SetInt("_DstBlend", (int)(isAdditive ? BlendMode.One : BlendMode.OneMinusSrcAlpha));
            }

            if (_runtimeMaterial.HasProperty("_ZWrite"))
            {
                _runtimeMaterial.SetInt("_ZWrite", 0);
            }

            _runtimeMaterial.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            _runtimeMaterial.renderQueue = (int)RenderQueue.Transparent;
        }

        private static Shader FindParticleShader()
        {
            string[] candidates =
            {
                "Universal Render Pipeline/Particles/Unlit",
                "Particles/Standard Unlit",
                "Sprites/Default",
                "Unlit/Transparent"
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                Shader shader = Shader.Find(candidates[i]);
                if (shader != null)
                {
                    return shader;
                }
            }

            return Shader.Find("Hidden/InternalErrorShader");
        }

        private static Texture2D CreateRadialSoftTexture(int size, float hardness)
        {
            Texture2D tex = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                name = "ProceduralParticleRadialTex",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.DontSave
            };

            Color[] pixels = new Color[size * size];
            float half = (size - 1) * 0.5f;

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = (x - half) / half;
                    float dy = (y - half) / half;
                    float dist = Mathf.Sqrt(dx * dx + dy * dy);
                    float alpha = Mathf.Pow(Mathf.Clamp01(1f - dist), hardness);
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
            }

            tex.SetPixels(pixels);
            tex.Apply(false, true);
            return tex;
        }

        private static Color ResolvePaletteColor(Color fallback, params string[] candidateNames)
        {
            Type paletteType = FindShipyardPaletteType();
            if (paletteType == null)
            {
                return fallback;
            }

            const BindingFlags flags = BindingFlags.Public | BindingFlags.Static;
            for (int i = 0; i < candidateNames.Length; i++)
            {
                string name = candidateNames[i];
                PropertyInfo prop = paletteType.GetProperty(name, flags);
                if (prop != null && prop.PropertyType == typeof(Color))
                {
                    return (Color)prop.GetValue(null);
                }

                FieldInfo field = paletteType.GetField(name, flags);
                if (field != null && field.FieldType == typeof(Color))
                {
                    return (Color)field.GetValue(null);
                }
            }

            return fallback;
        }

        private static Type FindShipyardPaletteType()
        {
            Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
            for (int i = 0; i < assemblies.Length; i++)
            {
                Type type = assemblies[i].GetType($"{nameof(ShipyardCat)}.{nameof(Core)}.ShipyardPalette", false);
                if (type != null)
                {
                    return type;
                }
            }

            return null;
        }

        private static void DestroyProceduralAsset(UnityEngine.Object asset)
        {
            if (asset == null)
            {
                return;
            }

            if (Application.isPlaying)
            {
                Destroy(asset);
            }
            else
            {
                DestroyImmediate(asset);
            }
        }
    }
}
