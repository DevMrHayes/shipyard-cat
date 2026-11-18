using UnityEngine;
using UnityEngine.Rendering;

namespace ShipyardCat.World
{
    public sealed class SeagullFlock : MonoBehaviour
    {
        private const int FlockSize = 6;

        [Header("Flight Area")]
        [SerializeField] private float baseHeight = 14f;
        [SerializeField] private float heightSpread = 4f;
        [SerializeField] private float baseRadiusX = 16f;
        [SerializeField] private float baseRadiusZ = 12f;
        [SerializeField] private float lissajousAmplitude = 4.5f;

        [Header("Motion & Flapping")]
        [SerializeField] private float baseAngularSpeed = 0.35f;
        [SerializeField] private float flapSpeed = 7.5f;
        [SerializeField] private float maxFlapAngle = 28f;
        [SerializeField] private float dihedralAngle = 8f;
        [SerializeField] private float maxBankAngle = 24f;
        [SerializeField] private float bankSensitivity = 1.8f;

        [Header("Visuals")]
        [SerializeField] private float baseWingSpan = 0.85f;
        [SerializeField] private Color gullColor = new Color(0.95f, 0.96f, 0.98f, 1f);
        [SerializeField] private bool castShadows = false;

        private struct GullState
        {
            public Transform Root;
            public Transform LeftWing;
            public Transform RightWing;
            public float RadiusX;
            public float RadiusZ;
            public float LissajousAmpX;
            public float LissajousAmpZ;
            public float LissajousFreqX;
            public float LissajousFreqZ;
            public float LissajousPhase;
            public float HeightOffset;
            public float BobAmplitude;
            public float BobFrequency;
            public float BobPhase;
            public float AngularSpeed;
            public float PathPhase;
            public float FlapSpeed;
            public float FlapPhase;
            public float GlideFrequency;
            public float GlidePhase;
        }

        private GullState[] _gulls;
        private Transform _cachedTransform;
        private Mesh _wingMesh;
        private Material _wingMaterial;

        private void Awake()
        {
            _cachedTransform = transform;
            _wingMesh = CreateWingMesh();
            _wingMaterial = CreateWingMaterial();
            SpawnFlock();
        }

        private void OnDestroy()
        {
            if (_wingMesh != null)
            {
                Destroy(_wingMesh);
                _wingMesh = null;
            }

            if (_wingMaterial != null)
            {
                Destroy(_wingMaterial);
                _wingMaterial = null;
            }
        }

        private void SpawnFlock()
        {
            _gulls = new GullState[FlockSize];
            ShadowCastingMode shadowMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;

            for (int i = 0; i < FlockSize; i++)
            {
                float norm = i / (float)FlockSize;
                float dir = (i % 2 == 0) ? 1f : -1f;

                GameObject rootGo = new GameObject($"Seagull_{i}");
                Transform rootTr = rootGo.transform;
                rootTr.SetParent(_cachedTransform, false);

                float span = baseWingSpan * Random.Range(0.88f, 1.15f);

                Transform leftWing = CreateWingChild("LeftWing", rootTr, new Vector3(-span, 1f, span), shadowMode);
                Transform rightWing = CreateWingChild("RightWing", rootTr, new Vector3(span, 1f, span), shadowMode);

                _gulls[i] = new GullState
                {
                    Root = rootTr,
                    LeftWing = leftWing,
                    RightWing = rightWing,
                    RadiusX = baseRadiusX * Random.Range(0.75f, 1.25f),
                    RadiusZ = baseRadiusZ * Random.Range(0.75f, 1.25f),
                    LissajousAmpX = lissajousAmplitude * Random.Range(0.6f, 1.2f),
                    LissajousAmpZ = lissajousAmplitude * Random.Range(0.6f, 1.2f),
                    LissajousFreqX = (i % 3 == 0) ? 2f : 3f,
                    LissajousFreqZ = 2f,
                    LissajousPhase = Random.Range(0f, Mathf.PI * 2f),
                    HeightOffset = (norm - 0.5f) * heightSpread + Random.Range(-0.8f, 0.8f),
                    BobAmplitude = Random.Range(0.4f, 1.1f),
                    BobFrequency = Random.Range(0.5f, 0.95f),
                    BobPhase = Random.Range(0f, Mathf.PI * 2f),
                    AngularSpeed = baseAngularSpeed * dir * Random.Range(0.85f, 1.2f),
                    PathPhase = norm * Mathf.PI * 2f + Random.Range(-0.35f, 0.35f),
                    FlapSpeed = flapSpeed * Random.Range(0.88f, 1.15f),
                    FlapPhase = Random.Range(0f, Mathf.PI * 2f),
                    GlideFrequency = Random.Range(0.28f, 0.52f),
                    GlidePhase = Random.Range(0f, Mathf.PI * 2f)
                };
            }
        }

        private Transform CreateWingChild(string wingName, Transform parent, Vector3 scale, ShadowCastingMode shadowMode)
        {
            GameObject wingGo = new GameObject(wingName);
            Transform wingTr = wingGo.transform;
            wingTr.SetParent(parent, false);
            wingTr.localScale = scale;

            MeshFilter mf = wingGo.AddComponent<MeshFilter>();
            mf.sharedMesh = _wingMesh;

            MeshRenderer mr = wingGo.AddComponent<MeshRenderer>();
            mr.sharedMaterial = _wingMaterial;
            mr.shadowCastingMode = shadowMode;
            mr.receiveShadows = false;

            return wingTr;
        }

        private void Update()
        {
            float t = Time.time;
            Vector3 origin = _cachedTransform.position;

            for (int i = 0; i < FlockSize; i++)
            {
                ref GullState gull = ref _gulls[i];

                float w = gull.AngularSpeed;
                float phase = t * w + gull.PathPhase;
                float lxPhase = gull.LissajousFreqX * phase + gull.LissajousPhase;
                float lzPhase = gull.LissajousFreqZ * phase;

                float sinP = Mathf.Sin(phase);
                float cosP = Mathf.Cos(phase);
                float sinLx = Mathf.Sin(lxPhase);
                float cosLx = Mathf.Cos(lxPhase);
                float sinLz = Mathf.Sin(lzPhase);
                float cosLz = Mathf.Cos(lzPhase);

                float bobArg = gull.BobFrequency * t + gull.BobPhase;
                float sinBob = Mathf.Sin(bobArg);
                float cosBob = Mathf.Cos(bobArg);

                float x = gull.RadiusX * sinP + gull.LissajousAmpX * sinLx;
                float z = gull.RadiusZ * cosP + gull.LissajousAmpZ * cosLz;
                float y = baseHeight + gull.HeightOffset + gull.BobAmplitude * sinBob;

                gull.Root.position = new Vector3(origin.x + x, origin.y + y, origin.z + z);

                // Analytical velocity for smooth heading
                float vx = w * (gull.RadiusX * cosP + gull.LissajousAmpX * gull.LissajousFreqX * cosLx);
                float vz = w * (-gull.RadiusZ * sinP - gull.LissajousAmpZ * gull.LissajousFreqZ * sinLz);
                float vy = gull.BobAmplitude * gull.BobFrequency * cosBob;

                Vector3 velocity = new Vector3(vx, vy, vz);
                if (velocity.sqrMagnitude > 0.0001f)
                {
                    // Analytical horizontal acceleration for banking into turns
                    float w2 = w * w;
                    float ax = -w2 * (gull.RadiusX * sinP + gull.LissajousAmpX * gull.LissajousFreqX * gull.LissajousFreqX * sinLx);
                    float az = -w2 * (gull.RadiusZ * cosP + gull.LissajousAmpZ * gull.LissajousFreqZ * gull.LissajousFreqZ * cosLz);

                    Vector3 horizVel = new Vector3(vx, 0f, vz);
                    float bankAngle = 0f;
                    if (horizVel.sqrMagnitude > 0.0001f)
                    {
                        Vector3 right = Vector3.Cross(Vector3.up, horizVel).normalized;
                        float lateralAccel = ax * right.x + az * right.z;
                        bankAngle = Mathf.Clamp(-lateralAccel * bankSensitivity, -maxBankAngle, maxBankAngle);
                    }

                    Quaternion heading = Quaternion.LookRotation(velocity, Vector3.up);
                    gull.Root.rotation = heading * Quaternion.Euler(0f, 0f, bankAngle);
                }

                // Smooth wing flap modulated by periodic soaring glides
                float glideMask = 0.5f + 0.5f * Mathf.Sin(t * gull.GlideFrequency + gull.GlidePhase);
                float flapAmplitude = maxFlapAngle * Mathf.Lerp(0.12f, 1f, glideMask);
                float flapAngle = dihedralAngle + Mathf.Sin(t * gull.FlapSpeed + gull.FlapPhase) * flapAmplitude;

                gull.RightWing.localRotation = Quaternion.Euler(0f, 0f, flapAngle);
                gull.LeftWing.localRotation = Quaternion.Euler(0f, 0f, -flapAngle);
            }
        }

        private static Mesh CreateWingMesh()
        {
            Mesh mesh = new Mesh
            {
                name = "ProceduralSeagullWing"
            };

            // 5 vertices for top surface + 5 duplicated vertices for bottom surface
            // Pivot is at (0,0,0), extending along +X with forward edge at +Z
            Vector3 v0 = new Vector3(0f, 0f, 0.14f);
            Vector3 v1 = new Vector3(0f, 0f, -0.10f);
            Vector3 v2 = new Vector3(0.52f, 0.05f, 0.04f);
            Vector3 v3 = new Vector3(0.48f, 0.02f, -0.12f);
            Vector3 v4 = new Vector3(1.0f, -0.02f, -0.20f);

            Vector3[] vertices =
            {
                v0, v1, v2, v3, v4,
                v0, v1, v2, v3, v4
            };

            int[] triangles =
            {
                // Top surface
                0, 2, 1,
                1, 2, 3,
                2, 4, 3,
                // Bottom surface
                5, 6, 7,
                6, 8, 7,
                7, 8, 9
            };

            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        private Material CreateWingMaterial()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit")
                ?? Shader.Find("Universal Render Pipeline/Simple Lit")
                ?? Shader.Find("Standard")
                ?? Shader.Find("Sprites/Default");

            Material mat = new Material(shader)
            {
                name = "ProceduralSeagullWingMat",
                color = gullColor
            };

            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", gullColor);
            }

            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", 0.15f);
            }

            return mat;
        }
    }
}
