using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;

namespace ShipyardCat.Player
{
    [ExecuteAlways]
    [DisallowMultipleComponent]
    public class AlbaVisualRig : MonoBehaviour
    {
        private const string ScaleWrapperName = "Alba_ScaleWrapper";
        private const string SafetyCollarName = "Alba_SafetyCollar";
        private const string BrassTagName = "Alba_BrassNnsTag";
        private const string DosimeterName = "Alba_LcdDosimeter";
        private const string DosimeterScreenName = "Alba_DosimeterScreen";
        private const string UrpLitShaderName = "Universal Render Pipeline/Lit";

        private static readonly int BaseMapId = Shader.PropertyToID("_BaseMap");
        private static readonly int MainTexId = Shader.PropertyToID("_MainTex");
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int MetallicId = Shader.PropertyToID("_Metallic");
        private static readonly int SmoothnessId = Shader.PropertyToID("_Smoothness");
        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");

        private static readonly Color32 CharcoalColor32 = new Color32(0x14, 0x16, 0x1A, 0xFF);
        private static readonly Color32 WhiteFurColor32 = new Color32(0xF2, 0xF4, 0xF8, 0xFF);

        private static readonly Color CollarOrange = new Color(1.0f, 0.3529412f, 0.07843138f, 1.0f);     // #FF5A14
        private static readonly Color BrassGold = new Color(0.83137256f, 0.65882355f, 0.2627451f, 1.0f);  // #D4A843
        private static readonly Color DosimeterBodyGray = new Color(0.14117648f, 0.15686275f, 0.18039216f, 1.0f);
        private static readonly Color ScreenBaseDark = new Color(0.03f, 0.05f, 0.04f, 1.0f);

        private static readonly Color PhosphorGreen = new Color(0.13333334f, 1.0f, 0.4f, 1.0f);         // #22FF66
        private static readonly Color AmberWarn = new Color(1.0f, 0.6666667f, 0.0f, 1.0f);              // #FFAA00
        private static readonly Color CrimsonAlert = new Color(1.0f, 0.13333334f, 0.2f, 1.0f);          // #FF2233

        [Header("Optional Overrides")]
        [SerializeField] private Material cachedTuxedoMaterial;

        [Header("Dosimeter Emission Tuning")]
        [SerializeField] private float colorSmoothingSpeed = 8.0f;
        [SerializeField] private float pulseFrequency = 7.5f;

        private CatVitals _vitals;
        private Func<float> _radiationGetter;
        private Func<float> _maxRadiationGetter;
        private bool _radiationAlreadyNormalized;

        private Texture2D _generatedTuxedoTexture;
        private Material _generatedTuxedoMaterial;
        private Material _collarMaterial;
        private Material _brassMaterial;
        private Material _dosimeterBodyMaterial;
        private Material _dosimeterScreenSharedMaterial;
        private Material _dosimeterScreenRuntimeMaterial;

        private Mesh _collarMesh;
        private Mesh _tagMesh;
        private Mesh _dosimeterBoxMesh;
        private Mesh _dosimeterScreenMesh;

        private MeshRenderer _dosimeterScreenRenderer;
        private Color _currentEmissionColor = PhosphorGreen * 1.8f;

        private readonly List<Renderer> _rendererBuffer = new List<Renderer>(16);

        private void Awake()
        {
            _vitals = GetComponent<CatVitals>();
            CacheVitalsAccessor();
            BuildOrRefreshVisuals();
        }

        private void OnEnable()
        {
            if (_vitals == null)
            {
                _vitals = GetComponent<CatVitals>();
            }

            if (_vitals != null && _radiationGetter == null)
            {
                CacheVitalsAccessor();
            }

            BuildOrRefreshVisuals();
        }

        private void Update()
        {
            if (!Application.isPlaying || _dosimeterScreenRenderer == null)
            {
                return;
            }

            Material activeScreenMat = _dosimeterScreenRuntimeMaterial;
            if (activeScreenMat == null)
            {
                return;
            }

            float normalizedRadiation = ReadNormalizedRadiation();
            Color targetEmission;

            if (normalizedRadiation < 0.25f)
            {
                targetEmission = PhosphorGreen * 1.8f;
            }
            else if (normalizedRadiation <= 0.65f)
            {
                targetEmission = AmberWarn * 2.1f;
            }
            else
            {
                float pulse = 0.5f + 0.5f * Mathf.Sin(Time.time * pulseFrequency);
                float intensity = Mathf.Lerp(1.35f, 3.4f, pulse);
                targetEmission = CrimsonAlert * intensity;
            }

            float lerpFactor = 1.0f - Mathf.Exp(-colorSmoothingSpeed * Time.deltaTime);
            _currentEmissionColor = Color.Lerp(_currentEmissionColor, targetEmission, lerpFactor);
            activeScreenMat.SetColor(EmissionColorId, _currentEmissionColor);
        }

        private void OnDestroy()
        {
            DestroyProceduralObject(_generatedTuxedoTexture);
            DestroyProceduralObject(_generatedTuxedoMaterial);
            DestroyProceduralObject(_collarMaterial);
            DestroyProceduralObject(_brassMaterial);
            DestroyProceduralObject(_dosimeterBodyMaterial);
            DestroyProceduralObject(_dosimeterScreenSharedMaterial);
            DestroyProceduralObject(_dosimeterScreenRuntimeMaterial);

            DestroyProceduralObject(_collarMesh);
            DestroyProceduralObject(_tagMesh);
            DestroyProceduralObject(_dosimeterBoxMesh);
            DestroyProceduralObject(_dosimeterScreenMesh);

            _generatedTuxedoTexture = null;
            _generatedTuxedoMaterial = null;
            _collarMaterial = null;
            _brassMaterial = null;
            _dosimeterBodyMaterial = null;
            _dosimeterScreenSharedMaterial = null;
            _dosimeterScreenRuntimeMaterial = null;
            _collarMesh = null;
            _tagMesh = null;
            _dosimeterBoxMesh = null;
            _dosimeterScreenMesh = null;
        }

        public void BuildOrRefreshVisuals()
        {
            EnsureMaterials();
            EnsureMeshes();

            Transform scaleWrapper = FindChildByName(transform, ScaleWrapperName);
            Transform visualRoot = scaleWrapper != null ? scaleWrapper : transform;

            ApplyTuxedoFurToChildren(visualRoot);
            BuildHardwareAttachments(visualRoot);
        }

        private void EnsureMaterials()
        {
            Shader urpLit = Shader.Find(UrpLitShaderName);
            if (urpLit == null)
            {
                urpLit = Shader.Find("Standard");
            }

            if (cachedTuxedoMaterial == null && _generatedTuxedoMaterial == null)
            {
                if (_generatedTuxedoTexture == null)
                {
                    _generatedTuxedoTexture = GenerateTuxedoTexture128();
                }

                _generatedTuxedoMaterial = CreateMaterial(urpLit, "Alba_TuxedoFur_Mat");
                _generatedTuxedoMaterial.SetTexture(BaseMapId, _generatedTuxedoTexture);
                _generatedTuxedoMaterial.SetTexture(MainTexId, _generatedTuxedoTexture);
                _generatedTuxedoMaterial.SetColor(BaseColorId, Color.white);
                _generatedTuxedoMaterial.SetFloat(MetallicId, 0.0f);
                _generatedTuxedoMaterial.SetFloat(SmoothnessId, 0.22f);
            }

            if (_collarMaterial == null)
            {
                _collarMaterial = CreateMaterial(urpLit, "Alba_SafetyCollar_Mat");
                _collarMaterial.SetColor(BaseColorId, CollarOrange);
                _collarMaterial.SetFloat(MetallicId, 0.05f);
                _collarMaterial.SetFloat(SmoothnessId, 0.58f);
                EnableEmission(_collarMaterial, CollarOrange * 1.35f);
            }

            if (_brassMaterial == null)
            {
                _brassMaterial = CreateMaterial(urpLit, "Alba_BrassNnsTag_Mat");
                _brassMaterial.SetColor(BaseColorId, BrassGold);
                _brassMaterial.SetFloat(MetallicId, 0.92f);
                _brassMaterial.SetFloat(SmoothnessId, 0.78f);
            }

            if (_dosimeterBodyMaterial == null)
            {
                _dosimeterBodyMaterial = CreateMaterial(urpLit, "Alba_LcdDosimeter_Mat");
                _dosimeterBodyMaterial.SetColor(BaseColorId, DosimeterBodyGray);
                _dosimeterBodyMaterial.SetFloat(MetallicId, 0.28f);
                _dosimeterBodyMaterial.SetFloat(SmoothnessId, 0.36f);
            }

            if (_dosimeterScreenSharedMaterial == null)
            {
                _dosimeterScreenSharedMaterial = CreateMaterial(urpLit, "Alba_DosimeterScreen_SharedMat");
                _dosimeterScreenSharedMaterial.SetColor(BaseColorId, ScreenBaseDark);
                _dosimeterScreenSharedMaterial.SetFloat(MetallicId, 0.0f);
                _dosimeterScreenSharedMaterial.SetFloat(SmoothnessId, 0.85f);
                EnableEmission(_dosimeterScreenSharedMaterial, PhosphorGreen * 1.8f);
            }

            if (Application.isPlaying && _dosimeterScreenRuntimeMaterial == null)
            {
                _dosimeterScreenRuntimeMaterial = new Material(_dosimeterScreenSharedMaterial)
                {
                    name = "Alba_DosimeterScreen_RuntimeMat",
                    hideFlags = HideFlags.DontSave
                };
                EnableEmission(_dosimeterScreenRuntimeMaterial, _currentEmissionColor);
            }
        }

        private void EnsureMeshes()
        {
            if (_collarMesh == null)
            {
                _collarMesh = BuildTorusMesh(0.068f, 0.016f, 0.65f, 28, 14);
            }

            if (_tagMesh == null)
            {
                _tagMesh = BuildDiscMesh(0.022f, 0.005f, 24);
            }

            if (_dosimeterBoxMesh == null)
            {
                _dosimeterBoxMesh = BuildBoxMesh(new Vector3(0.036f, 0.052f, 0.020f));
            }

            if (_dosimeterScreenMesh == null)
            {
                _dosimeterScreenMesh = BuildQuadMesh(0.026f, 0.028f);
            }
        }

        private void ApplyTuxedoFurToChildren(Transform visualRoot)
        {
            Material furMat = cachedTuxedoMaterial != null ? cachedTuxedoMaterial : _generatedTuxedoMaterial;
            if (furMat == null)
            {
                return;
            }

            _rendererBuffer.Clear();
            visualRoot.GetComponentsInChildren(true, _rendererBuffer);

            for (int i = 0; i < _rendererBuffer.Count; i++)
            {
                Renderer r = _rendererBuffer[i];
                if (r == null)
                {
                    continue;
                }

                if (!(r is SkinnedMeshRenderer) && !(r is MeshRenderer))
                {
                    continue;
                }

                if (IsAttachmentTransform(r.transform, visualRoot))
                {
                    continue;
                }

                Material[] currentShared = r.sharedMaterials;
                if (currentShared == null || currentShared.Length <= 1)
                {
                    r.sharedMaterial = furMat;
                }
                else
                {
                    bool needsUpdate = false;
                    for (int s = 0; s < currentShared.Length; s++)
                    {
                        if (currentShared[s] != furMat)
                        {
                            needsUpdate = true;
                            break;
                        }
                    }

                    if (needsUpdate)
                    {
                        Material[] assigned = new Material[currentShared.Length];
                        for (int s = 0; s < assigned.Length; s++)
                        {
                            assigned[s] = furMat;
                        }
                        r.sharedMaterials = assigned;
                    }
                }
            }

            _rendererBuffer.Clear();
        }

        private void BuildHardwareAttachments(Transform visualRoot)
        {
            // Parent directly to Alba_Player root (1:1 world meters) aligned cleanly to 1.45x cat.glb neck height
            Transform collarTransform = GetOrCreateChild(SafetyCollarName, transform);
            collarTransform.localPosition = new Vector3(0f, 0.27f, 0.16f);
            collarTransform.localRotation = Quaternion.Euler(28f, 0f, 0f);
            collarTransform.localScale = Vector3.one;
            AssignMeshAndMaterial(collarTransform, _collarMesh, _collarMaterial);

            Transform tagTransform = GetOrCreateChild(BrassTagName, transform);
            tagTransform.localPosition = new Vector3(0f, 0.21f, 0.21f);
            tagTransform.localRotation = Quaternion.Euler(14f, 0f, 0f);
            tagTransform.localScale = Vector3.one;
            AssignMeshAndMaterial(tagTransform, _tagMesh, _brassMaterial);

            Transform dosimeterTransform = GetOrCreateChild(DosimeterName, transform);
            dosimeterTransform.localPosition = new Vector3(-0.072f, 0.27f, 0.16f);
            dosimeterTransform.localRotation = Quaternion.Euler(0f, -45f, 0f);
            dosimeterTransform.localScale = Vector3.one;
            AssignMeshAndMaterial(dosimeterTransform, _dosimeterBoxMesh, _dosimeterBodyMaterial);

            Transform screenTransform = GetOrCreateChild(DosimeterScreenName, dosimeterTransform);
            screenTransform.localPosition = new Vector3(0f, 0.004f, 0.011f);
            screenTransform.localRotation = Quaternion.identity;
            screenTransform.localScale = Vector3.one;

            Material screenMat = Application.isPlaying && _dosimeterScreenRuntimeMaterial != null
                ? _dosimeterScreenRuntimeMaterial
                : _dosimeterScreenSharedMaterial;
            _dosimeterScreenRenderer = AssignMeshAndMaterial(screenTransform, _dosimeterScreenMesh, screenMat);
        }

        private static MeshRenderer AssignMeshAndMaterial(Transform target, Mesh mesh, Material sharedMat)
        {
            MeshFilter mf = target.GetComponent<MeshFilter>();
            if (mf == null)
            {
                mf = target.gameObject.AddComponent<MeshFilter>();
            }
            mf.sharedMesh = mesh;

            MeshRenderer mr = target.GetComponent<MeshRenderer>();
            if (mr == null)
            {
                mr = target.gameObject.AddComponent<MeshRenderer>();
            }
            mr.sharedMaterial = sharedMat;

            return mr;
        }

        private Transform GetOrCreateChild(string childName, Transform defaultParent)
        {
            Transform existing = FindChildByName(transform, childName);
            if (existing != null)
            {
                if (existing.parent != defaultParent && defaultParent != null)
                {
                    existing.SetParent(defaultParent, false);
                }
                return existing;
            }

            GameObject go = new GameObject(childName);
            Transform t = go.transform;
            t.SetParent(defaultParent, false);
            return t;
        }

        private static Transform FindChildByName(Transform root, string targetName)
        {
            if (root == null)
            {
                return null;
            }

            if (string.Equals(root.name, targetName, StringComparison.Ordinal))
            {
                return root;
            }

            int count = root.childCount;
            for (int i = 0; i < count; i++)
            {
                Transform found = FindChildByName(root.GetChild(i), targetName);
                if (found != null)
                {
                    return found;
                }
            }

            return null;
        }

        private static Transform FindNeckBone(Transform root)
        {
            Animator animator = root.GetComponentInChildren<Animator>(true);
            if (animator != null && animator.isHuman)
            {
                Transform humanNeck = animator.GetBoneTransform(HumanBodyBones.Neck);
                if (humanNeck != null)
                {
                    return humanNeck;
                }
            }

            return FindTransformContaining(root, "neck");
        }

        private static Transform FindTransformContaining(Transform current, string token)
        {
            if (current == null)
            {
                return null;
            }

            if (current.name.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0 &&
                !string.Equals(current.name, SafetyCollarName, StringComparison.Ordinal))
            {
                return current;
            }

            int count = current.childCount;
            for (int i = 0; i < count; i++)
            {
                Transform found = FindTransformContaining(current.GetChild(i), token);
                if (found != null)
                {
                    return found;
                }
            }

            return null;
        }

        private static bool IsAttachmentTransform(Transform t, Transform stopRoot)
        {
            Transform cur = t;
            while (cur != null && cur != stopRoot)
            {
                string n = cur.name;
                if (string.Equals(n, SafetyCollarName, StringComparison.Ordinal) ||
                    string.Equals(n, BrassTagName, StringComparison.Ordinal) ||
                    string.Equals(n, DosimeterName, StringComparison.Ordinal) ||
                    string.Equals(n, DosimeterScreenName, StringComparison.Ordinal))
                {
                    return true;
                }
                cur = cur.parent;
            }

            return false;
        }

        private void CacheVitalsAccessor()
        {
            _radiationGetter = null;
            _maxRadiationGetter = null;
            _radiationAlreadyNormalized = false;

            if (_vitals == null)
            {
                return;
            }

            Type vitalsType = _vitals.GetType();
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

            string[] normalizedProps =
            {
                "RadiationNormalized",
                "NormalizedRadiation",
                "Radiation01",
                "RadiationRatio"
            };

            for (int i = 0; i < normalizedProps.Length; i++)
            {
                PropertyInfo prop = vitalsType.GetProperty(normalizedProps[i], flags);
                if (prop != null && prop.PropertyType == typeof(float) && prop.GetGetMethod(true) != null)
                {
                    _radiationGetter = (Func<float>)Delegate.CreateDelegate(typeof(Func<float>), _vitals, prop.GetGetMethod(true));
                    _radiationAlreadyNormalized = true;
                    return;
                }
            }

            string[] rawProps =
            {
                "RadiationPercent",
                "RadiationLevel",
                "CurrentRadiation",
                "Radiation"
            };

            for (int i = 0; i < rawProps.Length; i++)
            {
                PropertyInfo prop = vitalsType.GetProperty(rawProps[i], flags);
                if (prop != null && prop.PropertyType == typeof(float) && prop.GetGetMethod(true) != null)
                {
                    _radiationGetter = (Func<float>)Delegate.CreateDelegate(typeof(Func<float>), _vitals, prop.GetGetMethod(true));
                    break;
                }
            }

            if (_radiationGetter == null)
            {
                MethodInfo method = vitalsType.GetMethod("GetRadiationNormalized", flags, null, Type.EmptyTypes, null);
                if (method != null && method.ReturnType == typeof(float))
                {
                    _radiationGetter = (Func<float>)Delegate.CreateDelegate(typeof(Func<float>), _vitals, method);
                    _radiationAlreadyNormalized = true;
                    return;
                }
            }

            string[] maxProps = { "MaxRadiation", "RadiationMax" };
            for (int i = 0; i < maxProps.Length; i++)
            {
                PropertyInfo maxProp = vitalsType.GetProperty(maxProps[i], flags);
                if (maxProp != null && maxProp.PropertyType == typeof(float) && maxProp.GetGetMethod(true) != null)
                {
                    _maxRadiationGetter = (Func<float>)Delegate.CreateDelegate(typeof(Func<float>), _vitals, maxProp.GetGetMethod(true));
                    break;
                }
            }
        }

        private float ReadNormalizedRadiation()
        {
            if (_vitals == null || _radiationGetter == null)
            {
                return 0.0f;
            }

            float value = _radiationGetter();
            if (_radiationAlreadyNormalized)
            {
                return Mathf.Clamp01(value);
            }

            if (_maxRadiationGetter != null)
            {
                float maxVal = _maxRadiationGetter();
                if (maxVal > 0.0001f)
                {
                    return Mathf.Clamp01(value / maxVal);
                }
            }

            if (value > 1.0f)
            {
                return Mathf.Clamp01(value * 0.01f);
            }

            return Mathf.Clamp01(value);
        }

        private static Texture2D GenerateTuxedoTexture128()
        {
            const int size = 128;
            Texture2D tex = new Texture2D(size, size, TextureFormat.RGBA32, true, false)
            {
                name = "Alba_TuxedoFur_Tex128",
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
                anisoLevel = 4,
                hideFlags = HideFlags.DontSave
            };

            Color32[] pixels = new Color32[size * size];

            for (int y = 0; y < size; y++)
            {
                float v = (y + 0.5f) / size;
                for (int x = 0; x < size; x++)
                {
                    float u = (x + 0.5f) / size;
                    float distFromCenterU = Mathf.Abs(u - 0.5f);

                    // Subtle deterministic fur-strand variation
                    float grain = Mathf.Sin(u * 97.0f + v * 23.0f) * Mathf.Cos(v * 71.0f - u * 13.0f);
                    float tuftWave = Mathf.Sin(u * 37.699f) * 0.018f + Mathf.Cos(u * 75.398f) * 0.008f;

                    bool isWhite = false;

                    // White paws (lower band)
                    if (v < 0.24f + tuftWave)
                    {
                        isWhite = true;
                    }

                    // White chest bib (tapered front shield)
                    if (v >= 0.22f && v <= 0.62f)
                    {
                        float bibT = (v - 0.22f) / 0.40f;
                        float halfWidth = Mathf.Lerp(0.18f, 0.085f, bibT) + tuftWave * 0.5f;
                        if (distFromCenterU < halfWidth)
                        {
                            isWhite = true;
                        }
                    }

                    // White muzzle & nose bridge
                    if (v > 0.62f && v <= 0.78f)
                    {
                        float muzzleT = (v - 0.62f) / 0.16f;
                        float muzzleHalfWidth = Mathf.Lerp(0.11f, 0.035f, muzzleT * muzzleT);
                        if (distFromCenterU < muzzleHalfWidth)
                        {
                            isWhite = true;
                        }
                    }

                    // White whiskers fanning outward from muzzle cheeks
                    if (distFromCenterU > 0.05f && distFromCenterU < 0.26f)
                    {
                        float whiskerDist = distFromCenterU - 0.05f;
                        float w1 = 0.695f + whiskerDist * 0.10f;
                        float w2 = 0.672f - whiskerDist * 0.02f;
                        float w3 = 0.650f - whiskerDist * 0.14f;
                        if (Mathf.Abs(v - w1) < 0.0075f ||
                            Mathf.Abs(v - w2) < 0.0075f ||
                            Mathf.Abs(v - w3) < 0.0075f)
                        {
                            isWhite = true;
                        }
                    }

                    Color32 baseCol = isWhite ? WhiteFurColor32 : CharcoalColor32;
                    int delta = Mathf.RoundToInt(grain * (isWhite ? 3.0f : 4.0f));
                    byte r = (byte)Mathf.Clamp(baseCol.r + delta, 0, 255);
                    byte g = (byte)Mathf.Clamp(baseCol.g + delta, 0, 255);
                    byte b = (byte)Mathf.Clamp(baseCol.b + delta, 0, 255);

                    pixels[y * size + x] = new Color32(r, g, b, 255);
                }
            }

            tex.SetPixels32(pixels);
            tex.Apply(true, false);
            return tex;
        }

        private static Material CreateMaterial(Shader shader, string matName)
        {
            return new Material(shader)
            {
                name = matName,
                hideFlags = HideFlags.DontSave
            };
        }

        private static void EnableEmission(Material mat, Color emissionColor)
        {
            mat.EnableKeyword("_EMISSION");
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            mat.SetColor(EmissionColorId, emissionColor);
        }

        private static Mesh BuildTorusMesh(float majorRadius, float minorRadius, float verticalSquash, int radialSegments, int tubularSegments)
        {
            Mesh mesh = new Mesh
            {
                name = "Alba_TorusCollarMesh",
                hideFlags = HideFlags.DontSave
            };

            int vertCount = (radialSegments + 1) * (tubularSegments + 1);
            Vector3[] vertices = new Vector3[vertCount];
            Vector3[] normals = new Vector3[vertCount];
            Vector2[] uvs = new Vector2[vertCount];
            int[] triangles = new int[radialSegments * tubularSegments * 6];

            int stride = tubularSegments + 1;
            int vIdx = 0;

            for (int i = 0; i <= radialSegments; i++)
            {
                float u = (float)i / radialSegments;
                float theta = u * Mathf.PI * 2.0f;
                float cosT = Mathf.Cos(theta);
                float sinT = Mathf.Sin(theta);

                Vector3 radialDir = new Vector3(cosT, 0f, sinT);
                Vector3 ringCenter = radialDir * majorRadius;

                for (int j = 0; j <= tubularSegments; j++)
                {
                    float v = (float)j / tubularSegments;
                    float phi = v * Mathf.PI * 2.0f;
                    float cosP = Mathf.Cos(phi);
                    float sinP = Mathf.Sin(phi);

                    Vector3 offset = radialDir * (minorRadius * cosP) + Vector3.up * (minorRadius * sinP * verticalSquash);
                    vertices[vIdx] = ringCenter + offset;

                    Vector3 rawNormal = radialDir * cosP + Vector3.up * (sinP / Mathf.Max(0.01f, verticalSquash));
                    normals[vIdx] = rawNormal.normalized;
                    uvs[vIdx] = new Vector2(u, v);
                    vIdx++;
                }
            }

            int tIdx = 0;
            for (int i = 0; i < radialSegments; i++)
            {
                for (int j = 0; j < tubularSegments; j++)
                {
                    int i00 = i * stride + j;
                    int i10 = (i + 1) * stride + j;
                    int i01 = i * stride + (j + 1);
                    int i11 = (i + 1) * stride + (j + 1);

                    triangles[tIdx++] = i00;
                    triangles[tIdx++] = i01;
                    triangles[tIdx++] = i10;

                    triangles[tIdx++] = i01;
                    triangles[tIdx++] = i11;
                    triangles[tIdx++] = i10;
                }
            }

            mesh.vertices = vertices;
            mesh.normals = normals;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Mesh BuildDiscMesh(float radius, float thickness, int segments)
        {
            Mesh mesh = new Mesh
            {
                name = "Alba_BrassTagDiscMesh",
                hideFlags = HideFlags.DontSave
            };

            float halfT = thickness * 0.5f;
            int capVertCount = segments + 2;
            int rimVertCount = (segments + 1) * 2;
            int totalVerts = capVertCount * 2 + rimVertCount;

            Vector3[] vertices = new Vector3[totalVerts];
            Vector3[] normals = new Vector3[totalVerts];
            Vector2[] uvs = new Vector2[totalVerts];
            int[] triangles = new int[segments * 3 * 2 + segments * 6];

            int frontCenter = 0;
            vertices[frontCenter] = new Vector3(0f, 0f, halfT);
            normals[frontCenter] = Vector3.forward;
            uvs[frontCenter] = new Vector2(0.5f, 0.5f);

            int backCenter = capVertCount;
            vertices[backCenter] = new Vector3(0f, 0f, -halfT);
            normals[backCenter] = Vector3.back;
            uvs[backCenter] = new Vector2(0.5f, 0.5f);

            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float angle = t * Mathf.PI * 2.0f;
                float x = Mathf.Cos(angle) * radius;
                float y = Mathf.Sin(angle) * radius;

                int fi = frontCenter + 1 + i;
                vertices[fi] = new Vector3(x, y, halfT);
                normals[fi] = Vector3.forward;
                uvs[fi] = new Vector2(0.5f + 0.5f * Mathf.Cos(angle), 0.5f + 0.5f * Mathf.Sin(angle));

                int bi = backCenter + 1 + i;
                vertices[bi] = new Vector3(x, y, -halfT);
                normals[bi] = Vector3.back;
                uvs[bi] = uvs[fi];
            }

            int rimStart = capVertCount * 2;
            for (int i = 0; i <= segments; i++)
            {
                float t = (float)i / segments;
                float angle = t * Mathf.PI * 2.0f;
                float cosA = Mathf.Cos(angle);
                float sinA = Mathf.Sin(angle);
                Vector3 n = new Vector3(cosA, sinA, 0f);

                int idxBack = rimStart + i * 2;
                int idxFront = idxBack + 1;

                vertices[idxBack] = new Vector3(cosA * radius, sinA * radius, -halfT);
                normals[idxBack] = n;
                uvs[idxBack] = new Vector2(t, 0f);

                vertices[idxFront] = new Vector3(cosA * radius, sinA * radius, halfT);
                normals[idxFront] = n;
                uvs[idxFront] = new Vector2(t, 1f);
            }

            int tri = 0;
            for (int i = 0; i < segments; i++)
            {
                triangles[tri++] = frontCenter;
                triangles[tri++] = frontCenter + 1 + i;
                triangles[tri++] = frontCenter + 2 + i;

                triangles[tri++] = backCenter;
                triangles[tri++] = backCenter + 2 + i;
                triangles[tri++] = backCenter + 1 + i;

                int r0B = rimStart + i * 2;
                int r0F = r0B + 1;
                int r1B = rimStart + (i + 1) * 2;
                int r1F = r1B + 1;

                triangles[tri++] = r0B;
                triangles[tri++] = r1B;
                triangles[tri++] = r0F;

                triangles[tri++] = r1B;
                triangles[tri++] = r1F;
                triangles[tri++] = r0F;
            }

            mesh.vertices = vertices;
            mesh.normals = normals;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Mesh BuildBoxMesh(Vector3 size)
        {
            Mesh mesh = new Mesh
            {
                name = "Alba_DosimeterBoxMesh",
                hideFlags = HideFlags.DontSave
            };

            Vector3 h = size * 0.5f;
            Vector3[] vertices = new Vector3[24];
            Vector3[] normals = new Vector3[24];
            Vector2[] uvs = new Vector2[24];
            int[] triangles = new int[36];

            WriteBoxFace(0, Vector3.forward * h.z, Vector3.right * h.x, Vector3.up * h.y, Vector3.forward, vertices, normals, uvs, triangles, 0);
            WriteBoxFace(4, Vector3.back * h.z, Vector3.left * h.x, Vector3.up * h.y, Vector3.back, vertices, normals, uvs, triangles, 6);
            WriteBoxFace(8, Vector3.right * h.x, Vector3.back * h.z, Vector3.up * h.y, Vector3.right, vertices, normals, uvs, triangles, 12);
            WriteBoxFace(12, Vector3.left * h.x, Vector3.forward * h.z, Vector3.up * h.y, Vector3.left, vertices, normals, uvs, triangles, 18);
            WriteBoxFace(16, Vector3.up * h.y, Vector3.right * h.x, Vector3.back * h.z, Vector3.up, vertices, normals, uvs, triangles, 24);
            WriteBoxFace(20, Vector3.down * h.y, Vector3.right * h.x, Vector3.forward * h.z, Vector3.down, vertices, normals, uvs, triangles, 30);

            mesh.vertices = vertices;
            mesh.normals = normals;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateBounds();
            return mesh;
        }

        private static void WriteBoxFace(
            int vOffset,
            Vector3 center,
            Vector3 rightExtent,
            Vector3 upExtent,
            Vector3 normal,
            Vector3[] vertices,
            Vector3[] normals,
            Vector2[] uvs,
            int[] triangles,
            int tOffset)
        {
            vertices[vOffset + 0] = center - rightExtent - upExtent;
            vertices[vOffset + 1] = center + rightExtent - upExtent;
            vertices[vOffset + 2] = center + rightExtent + upExtent;
            vertices[vOffset + 3] = center - rightExtent + upExtent;

            for (int i = 0; i < 4; i++)
            {
                normals[vOffset + i] = normal;
            }

            uvs[vOffset + 0] = new Vector2(0f, 0f);
            uvs[vOffset + 1] = new Vector2(1f, 0f);
            uvs[vOffset + 2] = new Vector2(1f, 1f);
            uvs[vOffset + 3] = new Vector2(0f, 1f);

            triangles[tOffset + 0] = vOffset + 0;
            triangles[tOffset + 1] = vOffset + 1;
            triangles[tOffset + 2] = vOffset + 2;
            triangles[tOffset + 3] = vOffset + 0;
            triangles[tOffset + 4] = vOffset + 2;
            triangles[tOffset + 5] = vOffset + 3;
        }

        private static Mesh BuildQuadMesh(float width, float height)
        {
            Mesh mesh = new Mesh
            {
                name = "Alba_DosimeterScreenQuadMesh",
                hideFlags = HideFlags.DontSave
            };

            float hw = width * 0.5f;
            float hh = height * 0.5f;

            mesh.vertices = new[]
            {
                new Vector3(-hw, -hh, 0f),
                new Vector3(hw, -hh, 0f),
                new Vector3(hw, hh, 0f),
                new Vector3(-hw, hh, 0f)
            };

            mesh.normals = new[]
            {
                Vector3.forward,
                Vector3.forward,
                Vector3.forward,
                Vector3.forward
            };

            mesh.uv = new[]
            {
                new Vector2(0f, 0f),
                new Vector2(1f, 0f),
                new Vector2(1f, 1f),
                new Vector2(0f, 1f)
            };

            mesh.triangles = new[] { 0, 1, 2, 0, 2, 3 };
            mesh.RecalculateBounds();
            return mesh;
        }

        private static void DestroyProceduralObject(UnityEngine.Object obj)
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
