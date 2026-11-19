using UnityEngine;

namespace ShipyardCat.AI
{
    [DisallowMultipleComponent]
    public sealed class KingpinArenaRig : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private KingpinBossAI bossAI;

        [Header("Overhead Rim Spotlights")]
        [SerializeField] private float maxRimIntensity = 45f;
        [SerializeField] private float intensityFadeSpeed = 55f;
        [SerializeField] private float spotAngle = 55f;
        [SerializeField] private float innerSpotAngle = 25f;
        [SerializeField] private float spotRange = 32f;
        [SerializeField] private float aimHeightOffset = 1.4f;
        [SerializeField] private Color warmAmberColor = new Color(1.0f, 0.62f, 0.22f, 1.0f);
        [SerializeField] private Color coolCyanColor = new Color(0.22f, 0.85f, 1.0f, 1.0f);

        [Header("Dust & Puddle Splash Bursts")]
        [SerializeField] private float fastMoveSpeedThreshold = 5.0f;
        [SerializeField] private float moveBurstCooldown = 0.16f;
        [SerializeField] private int moveBurstCount = 8;
        [SerializeField] private int stateChangeBurstCount = 16;
        [SerializeField] private Vector3 particleSpawnOffset = new Vector3(0f, 0.15f, 0f);
        [SerializeField] private Color dustColor = new Color(0.58f, 0.54f, 0.46f, 0.85f);
        [SerializeField] private Color puddleSplashColor = new Color(0.55f, 0.78f, 0.86f, 0.90f);

        private Transform _bossTransform;
        private Transform _rimLight1Transform;
        private Transform _rimLight2Transform;
        private Light _rimLight1;
        private Light _rimLight2;

        private Transform _splashTransform;
        private ParticleSystem _splashParticles;
        private Material _particleMaterial;
        private Texture2D _particleTexture;

        private float _currentIntensity;
        private float _fastMoveSpeedSqr;
        private float _moveBurstTimer;
        private Vector3 _lastBossPos;
        private bool _isSubscribed;

        private void Awake()
        {
            ResolveBossReference();
            _fastMoveSpeedSqr = fastMoveSpeedThreshold * fastMoveSpeedThreshold;

            CreateRimLights();
            CreateSplashParticleSystem();

            if (_bossTransform != null)
            {
                _lastBossPos = _bossTransform.position;
                AimLightsAtBoss();
            }
        }

        private void OnEnable()
        {
            SubscribeToBossEvents();

            if (_bossTransform != null)
            {
                _lastBossPos = _bossTransform.position;
            }
        }

        private void OnDisable()
        {
            UnsubscribeFromBossEvents();
        }

        private void OnDestroy()
        {
            UnsubscribeFromBossEvents();

            if (_particleMaterial != null)
            {
                Destroy(_particleMaterial);
                _particleMaterial = null;
            }

            if (_particleTexture != null)
            {
                Destroy(_particleTexture);
                _particleTexture = null;
            }
        }

        private void Update()
        {
            if (bossAI == null || _bossTransform == null)
            {
                return;
            }

            float dt = Time.deltaTime;

            UpdateRimLights(dt);
            UpdateFastMovementBursts(dt);
        }

        private void ResolveBossReference()
        {
            if (bossAI == null)
            {
                bossAI = GetComponent<KingpinBossAI>();
            }

            if (bossAI == null)
            {
                bossAI = GetComponentInParent<KingpinBossAI>();
            }

            if (bossAI == null)
            {
                bossAI = GetComponentInChildren<KingpinBossAI>();
            }

            if (bossAI == null)
            {
                bossAI = FindFirstObjectByType<KingpinBossAI>();
            }

            if (bossAI != null)
            {
                _bossTransform = bossAI.transform;
            }
        }

        private void SubscribeToBossEvents()
        {
            if (!_isSubscribed && bossAI != null)
            {
                bossAI.OnBossStateChanged += HandleBossStateChanged;
                _isSubscribed = true;
            }
        }

        private void UnsubscribeFromBossEvents()
        {
            if (_isSubscribed && bossAI != null)
            {
                bossAI.OnBossStateChanged -= HandleBossStateChanged;
                _isSubscribed = false;
            }
        }

        private void CreateRimLights()
        {
            _rimLight1 = CreateSpotLight(
                "ArenaRimLight_1",
                new Vector3(-6f, 12f, -8f),
                warmAmberColor,
                out _rimLight1Transform
            );

            _rimLight2 = CreateSpotLight(
                "ArenaRimLight_2",
                new Vector3(6f, 12f, 8f),
                coolCyanColor,
                out _rimLight2Transform
            );

            _currentIntensity = 0f;
            _rimLight1.intensity = 0f;
            _rimLight2.intensity = 0f;
            _rimLight1.enabled = false;
            _rimLight2.enabled = false;
        }

        private Light CreateSpotLight(string lightName, Vector3 localPos, Color color, out Transform lightTransform)
        {
            GameObject go = new GameObject(lightName);
            lightTransform = go.transform;
            lightTransform.SetParent(transform, false);
            lightTransform.localPosition = localPos;

            Light spot = go.AddComponent<Light>();
            spot.type = LightType.Spot;
            spot.color = color;
            spot.intensity = 0f;
            spot.range = spotRange;
            spot.spotAngle = spotAngle;
            spot.innerSpotAngle = innerSpotAngle;
            spot.shadows = LightShadows.None;
            spot.renderMode = LightRenderMode.Auto;

            return spot;
        }

        private void CreateSplashParticleSystem()
        {
            GameObject go = new GameObject("KingpinSplashParticles");
            _splashTransform = go.transform;
            _splashTransform.SetParent(transform, false);
            _splashTransform.localPosition = particleSpawnOffset;

            _splashParticles = go.AddComponent<ParticleSystem>();

            ParticleSystem.MainModule main = _splashParticles.main;
            main.playOnAwake = false;
            main.loop = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.32f, 0.65f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(2.2f, 5.4f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.08f, 0.22f);
            main.gravityModifier = 1.65f;
            main.maxParticles = 64;
            main.startColor = new ParticleSystem.MinMaxGradient(dustColor, puddleSplashColor);

            ParticleSystem.EmissionModule emission = _splashParticles.emission;
            emission.enabled = false;

            ParticleSystem.ShapeModule shape = _splashParticles.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 52f;
            shape.radius = 0.6f;
            shape.rotation = new Vector3(-90f, 0f, 0f);

            ParticleSystem.SizeOverLifetimeModule sizeOverLifetime = _splashParticles.sizeOverLifetime;
            sizeOverLifetime.enabled = true;
            AnimationCurve shrinkCurve = new AnimationCurve(
                new Keyframe(0f, 1f),
                new Keyframe(1f, 0f)
            );
            sizeOverLifetime.size = new ParticleSystem.MinMaxCurve(1f, shrinkCurve);

            ParticleSystemRenderer psRenderer = go.GetComponent<ParticleSystemRenderer>();
            psRenderer.renderMode = ParticleSystemRenderMode.Billboard;
            psRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            psRenderer.receiveShadows = false;
            psRenderer.sharedMaterial = CreateParticleMaterial();
        }

        private Material CreateParticleMaterial()
        {
            const int size = 16;
            _particleTexture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };

            Color32[] pixels = new Color32[size * size];
            float half = (size - 1) * 0.5f;
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = (x - half) / half;
                    float dy = (y - half) / half;
                    float dist = Mathf.Sqrt(dx * dx + dy * dy);
                    float alpha = Mathf.Clamp01(1f - dist);
                    alpha *= alpha;
                    byte a = (byte)Mathf.RoundToInt(alpha * 255f);
                    pixels[y * size + x] = new Color32(255, 255, 255, a);
                }
            }

            _particleTexture.SetPixels32(pixels);
            _particleTexture.Apply(false, true);

            Shader shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (shader != null)
            {
                _particleMaterial = new Material(shader);
                _particleMaterial.SetFloat("_Surface", 1f);
                _particleMaterial.SetFloat("_Blend", 0f);
                _particleMaterial.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
                _particleMaterial.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
                _particleMaterial.SetFloat("_ZWrite", 0f);
                _particleMaterial.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                _particleMaterial.renderQueue = 3000;
            }
            else
            {
                shader = Shader.Find("Particles/Standard Unlit");
                if (shader == null)
                {
                    shader = Shader.Find("Sprites/Default");
                }

                _particleMaterial = new Material(shader);
            }

            _particleMaterial.mainTexture = _particleTexture;
            if (_particleMaterial.HasProperty("_BaseMap"))
            {
                _particleMaterial.SetTexture("_BaseMap", _particleTexture);
            }

            return _particleMaterial;
        }

        private void UpdateRimLights(float dt)
        {
            AimLightsAtBoss();

            float targetIntensity = bossAI.IsAggro ? maxRimIntensity : 0f;
            _currentIntensity = Mathf.MoveTowards(_currentIntensity, targetIntensity, intensityFadeSpeed * dt);

            bool shouldEnable = _currentIntensity > 0.001f;
            if (_rimLight1.enabled != shouldEnable)
            {
                _rimLight1.enabled = shouldEnable;
                _rimLight2.enabled = shouldEnable;
            }

            if (shouldEnable)
            {
                _rimLight1.intensity = _currentIntensity;
                _rimLight2.intensity = _currentIntensity;
            }
        }

        private void AimLightsAtBoss()
        {
            Vector3 aimTarget = _bossTransform.position;
            aimTarget.y += aimHeightOffset;

            Vector3 dir1 = aimTarget - _rimLight1Transform.position;
            if (dir1.sqrMagnitude > 0.0001f)
            {
                _rimLight1Transform.rotation = Quaternion.LookRotation(dir1);
            }

            Vector3 dir2 = aimTarget - _rimLight2Transform.position;
            if (dir2.sqrMagnitude > 0.0001f)
            {
                _rimLight2Transform.rotation = Quaternion.LookRotation(dir2);
            }
        }

        private void UpdateFastMovementBursts(float dt)
        {
            if (_moveBurstTimer > 0f)
            {
                _moveBurstTimer -= dt;
            }

            Vector3 currentBossPos = _bossTransform.position;
            if (dt > 0.0001f)
            {
                float invDt = 1f / dt;
                Vector3 delta = currentBossPos - _lastBossPos;
                float sqrSpeed = delta.sqrMagnitude * (invDt * invDt);

                if (sqrSpeed >= _fastMoveSpeedSqr && _moveBurstTimer <= 0f)
                {
                    EmitSplashBurst(moveBurstCount);
                    _moveBurstTimer = moveBurstCooldown;
                }
            }

            _lastBossPos = currentBossPos;
        }

        private void HandleBossStateChanged(float health, float maxHealth, bool isAggro)
        {
            EmitSplashBurst(stateChangeBurstCount);
        }

        private void EmitSplashBurst(int count)
        {
            if (_splashParticles == null || _bossTransform == null)
            {
                return;
            }

            _splashTransform.position = _bossTransform.position + particleSpawnOffset;
            _splashParticles.Emit(count);
        }
    }
}
