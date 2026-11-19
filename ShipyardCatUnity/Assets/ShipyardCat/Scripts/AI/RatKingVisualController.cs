using UnityEngine;

namespace ShipyardCat.AI
{
    /// <summary>
    /// Anchors Dockyard Kingpin glowing eyes directly to rat.glb's animated Head bone sockets
    /// and preserves the underlying rat.glb fur texture with a weathered battle-scarred tint.
    /// </summary>
    [ExecuteAlways]
    [DisallowMultipleComponent]
    public sealed class RatKingVisualController : MonoBehaviour
    {
        public const string EyeLeftName = "KingpinEye_L";
        public const string EyeRightName = "KingpinEye_R";

        [SerializeField] private Material scarredFurMaterial;
        [SerializeField] private Material crimsonEyeMaterial;

        private Transform _headBone;
        private Transform _headEndBone;
        private Transform _leftEye;
        private Transform _rightEye;
        private bool _bonesResolved;

        public Transform ResolvedHeadBone
        {
            get
            {
                ResolveHierarchyAndAnchors();
                return _headBone;
            }
        }

        public void ConfigurePersistedMaterials(Material furMaterial, Material eyeMaterial)
        {
            if (furMaterial != null) scarredFurMaterial = furMaterial;
            if (eyeMaterial != null) crimsonEyeMaterial = eyeMaterial;
            BuildOrRefreshVisuals();
        }

        private void Awake()
        {
            BuildOrRefreshVisuals();
        }

        private void OnEnable()
        {
            BuildOrRefreshVisuals();
        }

        private void LateUpdate()
        {
            SyncEyesToSkull();
        }

        private void OnDestroy()
        {
            CleanupProceduralMaterial(ref scarredFurMaterial);
            CleanupProceduralMaterial(ref crimsonEyeMaterial);
        }

        public void BuildOrRefreshVisuals()
        {
            _bonesResolved = false;
            ResolveHierarchyAndAnchors();
            ApplyPreservedScarredFurMaterial();
            EnsureEyePrimitives();
            SyncEyesToSkull();
        }

        private void ResolveHierarchyAndAnchors()
        {
            if (_bonesResolved && _headBone != null)
            {
                return;
            }

            _headBone = null;
            _headEndBone = null;

            foreach (Transform t in GetComponentsInChildren<Transform>(true))
            {
                string n = t.name;
                if (n.IndexOf("Head_end", System.StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    _headEndBone = t;
                }
                else if (n.IndexOf("Head_01", System.StringComparison.OrdinalIgnoreCase) >= 0 ||
                         (string.Equals(n, "Head", System.StringComparison.OrdinalIgnoreCase) && _headBone == null))
                {
                    _headBone = t;
                }
            }

            if (_headBone == null)
            {
                foreach (Transform t in GetComponentsInChildren<Transform>(true))
                {
                    if (t.name.IndexOf("head", System.StringComparison.OrdinalIgnoreCase) >= 0 &&
                        t.name.IndexOf("end", System.StringComparison.OrdinalIgnoreCase) < 0)
                    {
                        _headBone = t;
                        break;
                    }
                }
            }

            _bonesResolved = _headBone != null;
        }

        private void ApplyPreservedScarredFurMaterial()
        {
            SkinnedMeshRenderer smr = GetComponentInChildren<SkinnedMeshRenderer>(true);
            if (smr == null)
            {
                return;
            }

            Texture preservedBaseTex = null;
            Material sourceMat = smr.sharedMaterial;
            if (sourceMat != null)
            {
                if (sourceMat.HasProperty("_BaseMap")) preservedBaseTex = sourceMat.GetTexture("_BaseMap");
                if (preservedBaseTex == null && sourceMat.HasProperty("_MainTex")) preservedBaseTex = sourceMat.GetTexture("_MainTex");
                if (preservedBaseTex == null) preservedBaseTex = sourceMat.mainTexture;
            }

            // Re-try looking up embedded glTF base texture if material was previously wiped to KingpinScarredFurMat
            if (preservedBaseTex == null && scarredFurMaterial != null && scarredFurMaterial.HasProperty("_BaseMap"))
            {
                preservedBaseTex = scarredFurMaterial.GetTexture("_BaseMap");
            }

            if (scarredFurMaterial == null)
            {
                Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                scarredFurMaterial = new Material(urpLit)
                {
                    name = "Kingpin_ScarredWetFur_Mat",
                    hideFlags = HideFlags.DontSave
                };
            }

            // Darker scarred tint that multiplies native rat.glb fur texture instead of wiping it to solid brown
            Color furTint = preservedBaseTex != null
                ? new Color(0.68f, 0.56f, 0.52f, 1f)
                : new Color(0.28f, 0.23f, 0.21f, 1f);

            if (scarredFurMaterial.HasProperty("_BaseColor")) scarredFurMaterial.SetColor("_BaseColor", furTint);
            if (scarredFurMaterial.HasProperty("_Color")) scarredFurMaterial.SetColor("_Color", furTint);
            if (scarredFurMaterial.HasProperty("_Metallic")) scarredFurMaterial.SetFloat("_Metallic", 0.04f);
            if (scarredFurMaterial.HasProperty("_Smoothness")) scarredFurMaterial.SetFloat("_Smoothness", 0.34f);

            if (preservedBaseTex != null)
            {
                if (scarredFurMaterial.HasProperty("_BaseMap")) scarredFurMaterial.SetTexture("_BaseMap", preservedBaseTex);
                if (scarredFurMaterial.HasProperty("_MainTex")) scarredFurMaterial.SetTexture("_MainTex", preservedBaseTex);
            }

            smr.sharedMaterial = scarredFurMaterial;
        }

        private void EnsureEyePrimitives()
        {
            if (crimsonEyeMaterial == null)
            {
                Shader urpUnlit = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                crimsonEyeMaterial = new Material(urpUnlit)
                {
                    name = "Kingpin_CrimsonEye_Mat",
                    hideFlags = HideFlags.DontSave
                };
                Color eyeCore = new Color(1f, 0.14f, 0.05f, 1f);
                if (crimsonEyeMaterial.HasProperty("_BaseColor")) crimsonEyeMaterial.SetColor("_BaseColor", eyeCore);
                if (crimsonEyeMaterial.HasProperty("_Color")) crimsonEyeMaterial.SetColor("_Color", eyeCore);
                if (crimsonEyeMaterial.HasProperty("_EmissionColor"))
                {
                    crimsonEyeMaterial.EnableKeyword("_EMISSION");
                    crimsonEyeMaterial.SetColor("_EmissionColor", new Color(1f, 0.22f, 0.04f, 1f) * 3.8f);
                }
            }

            _leftEye = FindOrCreateEye(EyeLeftName);
            _rightEye = FindOrCreateEye(EyeRightName);
        }

        private Transform FindOrCreateEye(string eyeName)
        {
            Transform existing = transform.Find(eyeName);
            if (existing == null)
            {
                foreach (Transform t in GetComponentsInChildren<Transform>(true))
                {
                    if (t.name == eyeName)
                    {
                        existing = t;
                        break;
                    }
                }
            }

            if (existing == null)
            {
                GameObject go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                go.name = eyeName;
                Collider col = go.GetComponent<Collider>();
                if (col != null)
                {
                    if (Application.isPlaying) Destroy(col);
                    else DestroyImmediate(col);
                }
                existing = go.transform;
            }

            // Keep eyes at DockyardKingpin_Boss root scale (1,1,1) while tracking Head bone in SyncEyesToSkull()
            if (existing.parent != transform)
            {
                existing.SetParent(transform, false);
            }

            Renderer r = existing.GetComponent<Renderer>();
            if (r != null)
            {
                r.sharedMaterial = crimsonEyeMaterial;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }

            return existing;
        }

        private void SyncEyesToSkull()
        {
            if (_leftEye == null || _rightEye == null)
            {
                return;
            }

            ResolveHierarchyAndAnchors();

            if (_headBone != null)
            {
                Vector3 snoutDir;
                float headLen;

                if (_headEndBone != null)
                {
                    Vector3 delta = _headEndBone.position - _headBone.position;
                    headLen = Mathf.Clamp(delta.magnitude, 0.22f, 0.85f);
                    snoutDir = delta.sqrMagnitude > 1e-5f ? delta.normalized : transform.forward;
                }
                else
                {
                    headLen = 0.42f;
                    snoutDir = -transform.forward;
                }

                Vector3 upDir = Vector3.ProjectOnPlane(Vector3.up, snoutDir);
                if (upDir.sqrMagnitude < 1e-4f) upDir = transform.up;
                upDir.Normalize();

                Vector3 rightDir = Vector3.Cross(upDir, snoutDir).normalized;

                float eyeDiameter = Mathf.Clamp(headLen * 0.13f, 0.032f, 0.055f);
                Vector3 eyeScale = Vector3.one * eyeDiameter;
                _leftEye.localScale = eyeScale;
                _rightEye.localScale = eyeScale;

                // Place eyes snugly in the upper cranial eye sockets between Head_01 and Head_end_014
                Vector3 browBase = _headBone.position + snoutDir * (headLen * 0.40f) + upDir * (headLen * 0.15f);
                float lateralOffset = headLen * 0.21f;

                _leftEye.position = browBase - rightDir * lateralOffset;
                _rightEye.position = browBase + rightDir * lateralOffset;
            }
            else
            {
                // Fallback strictly within bounds
                Vector3 fallbackBase = transform.position + transform.forward * 0.35f + Vector3.up * 0.32f;
                _leftEye.localScale = Vector3.one * 0.045f;
                _rightEye.localScale = Vector3.one * 0.045f;
                _leftEye.position = fallbackBase - transform.right * 0.08f;
                _rightEye.position = fallbackBase + transform.right * 0.08f;
            }
        }

        private static void CleanupProceduralMaterial(ref Material mat)
        {
            if (mat == null) return;
            if ((mat.hideFlags & HideFlags.DontSave) != 0)
            {
                if (Application.isPlaying) Destroy(mat);
                else DestroyImmediate(mat);
            }
            mat = null;
        }
    }
}
