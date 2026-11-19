using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace ShipyardCat.Editor
{
    /// <summary>
    /// Bakes and persists procedural PBR/VFX textures and URP materials for wet asphalt puddles,
    /// murky DD1 culvert sump water, galvanized diamond-plate catwalk grating, weathered 45-deg
    /// hazard copings, and lamppost halo billboards so Wave 2 stays WebGL2-safe with zero custom HLSL risk.
    /// </summary>
    public static class EnvironmentTextureBaker
    {
        private const string MaterialsDir = "Assets/ShipyardCat/Materials";

        public const string WetPuddleTexPath = MaterialsDir + "/WetPuddle_OrganicMask_512.png";
        public const string WetPuddleMatPath = MaterialsDir + "/Mat_WetPuddle_Organic.mat";

        public const string ToxicSumpTexPath = MaterialsDir + "/ToxicSump_Murky_512.png";
        public const string ToxicSumpMatPath = MaterialsDir + "/Mat_ToxicSump_Murky.mat";

        public const string DiamondPlateTexPath = MaterialsDir + "/Catwalk_DiamondPlate_512.png";
        public const string DiamondPlateNormPath = MaterialsDir + "/Catwalk_DiamondPlate_Normal_512.png";
        public const string DiamondPlateMatPath = MaterialsDir + "/Mat_Catwalk_DiamondPlate.mat";

        public const string HazardStripeTexPath = MaterialsDir + "/Hazard_Stripe45_256.png";
        public const string HazardStripeMatPath = MaterialsDir + "/Mat_Hazard_Stripe45.mat";

        public const string SoftGlowTexPath = MaterialsDir + "/VFX_SoftGlow_128.png";
        public const string LamppostHaloMatPath = MaterialsDir + "/Mat_LamppostHalo.mat";

        public struct BakedEnvironmentMaterials
        {
            public Material WetPuddleMat;
            public Material ToxicSumpMat;
            public Material DiamondPlateMat;
            public Material HazardStripeMat;
            public Material LamppostHaloMat;
        }

        private static float Smooth01(float edge0, float edge1, float x)
        {
            float t = Mathf.Clamp01((x - edge0) / (edge1 - edge0));
            return t * t * (3f - 2f * t);
        }

        public static void BakeAllEnvironmentTextures()
        {
            EnsureMaterialsFolder();
            EnsureWetPuddleMaskTexture(true);
            EnsureDiamondPlateTexture(true);
            EnsureSumpSludgeTexture(true);
            GetOrCreateWetPuddleMaterial(true);
            GetOrCreateDiamondPlateMaterial(true);
            GetOrCreateSumpSludgeMaterial(true);
        }

        public static Texture2D EnsureWetPuddleMaskTexture(bool forceRebuild = false)
        {
            if (!forceRebuild)
            {
                var existing = AssetDatabase.LoadAssetAtPath<Texture2D>(WetPuddleTexPath);
                if (existing != null) return existing;
            }
            return BakeOrganicPuddleTexture(512);
        }

        public static Texture2D EnsureSumpSludgeTexture(bool forceRebuild = false)
        {
            if (!forceRebuild)
            {
                var existing = AssetDatabase.LoadAssetAtPath<Texture2D>(ToxicSumpTexPath);
                if (existing != null) return existing;
            }
            return BakeMurkySumpTexture(512);
        }

        public static (Texture2D albedo, Texture2D normal) EnsureDiamondPlateTexture(bool forceRebuild = false)
        {
            if (!forceRebuild)
            {
                var existingAlbedo = AssetDatabase.LoadAssetAtPath<Texture2D>(DiamondPlateTexPath);
                var existingNormal = AssetDatabase.LoadAssetAtPath<Texture2D>(DiamondPlateNormPath);
                if (existingAlbedo != null && existingNormal != null)
                {
                    return (existingAlbedo, existingNormal);
                }
            }
            return BakeDiamondPlateTextures(512);
        }

        public static Material GetOrCreateWetPuddleMaterial(bool forceRebuild = false)
        {
            EnsureMaterialsFolder();
            if (!forceRebuild)
            {
                var existing = AssetDatabase.LoadAssetAtPath<Material>(WetPuddleMatPath);
                if (existing != null) return existing;
            }

            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Texture2D puddleTex = EnsureWetPuddleMaskTexture(forceRebuild);
            Material puddleMat = LoadOrCreateMaterial(WetPuddleMatPath, urpLit);

            Color puddleColor = new Color(0.06f, 0.08f, 0.11f, 0.86f);
            puddleMat.SetColor("_BaseColor", puddleColor);
            puddleMat.SetColor("_Color", puddleColor);
            puddleMat.SetTexture("_BaseMap", puddleTex);
            puddleMat.SetTexture("_MainTex", puddleTex);
            puddleMat.SetFloat("_Metallic", 0.35f);
            puddleMat.SetFloat("_Smoothness", 0.96f);
            puddleMat.SetFloat("_Surface", 0f);
            puddleMat.SetFloat("_AlphaClip", 1f);
            puddleMat.SetFloat("_Cutoff", 0.25f);
            puddleMat.SetFloat("_SrcBlend", (float)BlendMode.One);
            puddleMat.SetFloat("_DstBlend", (float)BlendMode.Zero);
            puddleMat.SetFloat("_ZWrite", 1f);
            puddleMat.SetFloat("_EnvironmentReflections", 1f);
            puddleMat.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            puddleMat.EnableKeyword("_ALPHATEST_ON");
            puddleMat.DisableKeyword("_EMISSION");
            puddleMat.SetColor("_EmissionColor", Color.black);
            puddleMat.SetOverrideTag("RenderType", "TransparentCutout");
            puddleMat.renderQueue = (int)RenderQueue.AlphaTest;
            EditorUtility.SetDirty(puddleMat);
            AssetDatabase.SaveAssets();

            return puddleMat;
        }

        public static Material GetOrCreateSumpSludgeMaterial(bool forceRebuild = false)
        {
            EnsureMaterialsFolder();
            if (!forceRebuild)
            {
                var existing = AssetDatabase.LoadAssetAtPath<Material>(ToxicSumpMatPath);
                if (existing != null) return existing;
            }

            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Texture2D sumpTex = EnsureSumpSludgeTexture(forceRebuild);
            Material sumpMat = LoadOrCreateMaterial(ToxicSumpMatPath, urpLit);
            sumpMat.SetColor("_BaseColor", new Color(0.62f, 0.72f, 0.56f, 0.94f));
            sumpMat.SetTexture("_BaseMap", sumpTex);
            sumpMat.SetTexture("_MainTex", sumpTex);
            sumpMat.SetTextureScale("_BaseMap", new Vector2(1.5f, 8f));
            sumpMat.SetFloat("_Metallic", 0.14f);
            sumpMat.SetFloat("_Smoothness", 0.95f);
            sumpMat.SetFloat("_Surface", 0f);
            sumpMat.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            sumpMat.SetOverrideTag("RenderType", "Opaque");
            sumpMat.renderQueue = (int)RenderQueue.Geometry;
            sumpMat.EnableKeyword("_EMISSION");
            sumpMat.SetColor("_EmissionColor", new Color(0.08f, 0.19f, 0.06f, 1f) * 0.35f);
            sumpMat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            EditorUtility.SetDirty(sumpMat);
            AssetDatabase.SaveAssets();

            return sumpMat;
        }

        public static Material GetOrCreateDiamondPlateMaterial(bool forceRebuild = false)
        {
            EnsureMaterialsFolder();
            if (!forceRebuild)
            {
                var existing = AssetDatabase.LoadAssetAtPath<Material>(DiamondPlateMatPath);
                if (existing != null) return existing;
            }

            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            (Texture2D dpAlbedo, Texture2D dpNormal) = EnsureDiamondPlateTexture(forceRebuild);
            Material dpMat = LoadOrCreateMaterial(DiamondPlateMatPath, urpLit);
            dpMat.SetColor("_BaseColor", Color.white);
            dpMat.SetTexture("_BaseMap", dpAlbedo);
            dpMat.SetTexture("_MainTex", dpAlbedo);
            dpMat.SetTexture("_BumpMap", dpNormal);
            dpMat.SetFloat("_BumpScale", 1.15f);
            dpMat.EnableKeyword("_NORMALMAP");
            dpMat.SetTextureScale("_BaseMap", new Vector2(3f, 32f));
            dpMat.SetTextureScale("_BumpMap", new Vector2(3f, 32f));
            dpMat.SetFloat("_Metallic", 0.82f);
            dpMat.SetFloat("_Smoothness", 0.44f);
            dpMat.SetFloat("_Surface", 0f);
            EditorUtility.SetDirty(dpMat);
            AssetDatabase.SaveAssets();

            return dpMat;
        }

        public static BakedEnvironmentMaterials BakeAllMaterials()
        {
            EnsureMaterialsFolder();
            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            Material puddleMat = GetOrCreateWetPuddleMaterial(true);
            Material sumpMat = GetOrCreateSumpSludgeMaterial(true);
            Material dpMat = GetOrCreateDiamondPlateMaterial(true);

            Texture2D hazardTex = BakeHazardStripeTexture(256);
            Material hazardMat = LoadOrCreateMaterial(HazardStripeMatPath, urpLit);
            hazardMat.SetColor("_BaseColor", Color.white);
            hazardMat.SetTexture("_BaseMap", hazardTex);
            hazardMat.SetTexture("_MainTex", hazardTex);
            hazardMat.SetTextureScale("_BaseMap", new Vector2(12f, 1f));
            hazardMat.SetFloat("_Metallic", 0.10f);
            hazardMat.SetFloat("_Smoothness", 0.32f);
            hazardMat.SetFloat("_Surface", 0f);
            EditorUtility.SetDirty(hazardMat);

            Texture2D haloTex = BakeSoftGlowTexture(128);
            Shader unlitParticle = Shader.Find("Universal Render Pipeline/Particles/Unlit") ?? Shader.Find("Universal Render Pipeline/Unlit") ?? urpLit;
            Material haloMat = LoadOrCreateMaterial(LamppostHaloMatPath, unlitParticle);
            haloMat.SetTexture("_BaseMap", haloTex);
            haloMat.SetTexture("_MainTex", haloTex);
            haloMat.SetColor("_BaseColor", new Color(1f, 0.82f, 0.55f, 0.52f));
            haloMat.SetColor("_Color", new Color(1f, 0.82f, 0.55f, 0.52f));
            haloMat.SetFloat("_Surface", 1f);
            haloMat.SetFloat("_Blend", 1f); // Additive
            haloMat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            haloMat.SetFloat("_DstBlend", (float)BlendMode.One);
            haloMat.SetFloat("_ZWrite", 0f);
            haloMat.SetFloat("_Cull", 0f);
            haloMat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            haloMat.renderQueue = (int)RenderQueue.Transparent + 5;
            EditorUtility.SetDirty(haloMat);

            AssetDatabase.SaveAssets();

            return new BakedEnvironmentMaterials
            {
                WetPuddleMat = puddleMat,
                ToxicSumpMat = sumpMat,
                DiamondPlateMat = dpMat,
                HazardStripeMat = hazardMat,
                LamppostHaloMat = haloMat
            };
        }

        private static Texture2D BakeOrganicPuddleTexture(int size)
        {
            Color32[] px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                float ny = (y / (float)(size - 1)) * 2f - 1f;
                for (int x = 0; x < size; x++)
                {
                    float nx = (x / (float)(size - 1)) * 2f - 1f;
                    float angle = Mathf.Atan2(ny, nx);
                    float r = Mathf.Sqrt(nx * nx + ny * ny);

                    // Irregular organic puddle silhouette warping (stays inside [-1, 1] UV bounds)
                    float lobe = 0.56f
                        + 0.14f * Mathf.Sin(angle * 2f + 0.6f)
                        + 0.09f * Mathf.Cos(angle * 3f - 1.1f)
                        + 0.06f * Mathf.Sin(angle * 5f + 2.2f);
                    float fbm = (Mathf.PerlinNoise(nx * 2.8f + 11.3f, ny * 2.8f + 5.7f) - 0.5f) * 0.28f
                              + (Mathf.PerlinNoise(nx * 6.4f + 3.1f, ny * 6.4f + 9.4f) - 0.5f) * 0.12f;

                    float distFromEdge = (lobe + fbm) - r;
                    float alphaMask = Smooth01(-0.08f, 0.08f, distFromEdge);
                    float microRipple = Mathf.PerlinNoise(nx * 9f + 20f, ny * 9f + 20f);

                    byte c = (byte)Mathf.Clamp(Mathf.RoundToInt(12f + microRipple * 14f), 0, 255);
                    byte a = (byte)Mathf.Clamp(Mathf.RoundToInt(alphaMask * 235f), 0, 255);
                    px[y * size + x] = new Color32(c, (byte)(c + 2), (byte)(c + 5), a);
                }
            }

            return SavePngTexture(WetPuddleTexPath, px, size, isNormal: false, alphaTransparency: true);
        }

        private static Texture2D BakeMurkySumpTexture(int size)
        {
            Color32[] px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                float v = y / (float)size;
                for (int x = 0; x < size; x++)
                {
                    float u = x / (float)size;
                    float flow = Mathf.PerlinNoise(u * 4.5f + 2.1f, v * 12f + Mathf.Sin(u * 6.28f) * 0.4f);
                    float scum = Mathf.PerlinNoise(u * 14f + 7.4f, v * 28f + 3.8f);
                    float streak = Smooth01(0.38f, 0.78f, flow * 0.7f + scum * 0.3f);

                    // Dark oily culvert water (#1A2614 -> #324C1D)
                    float r = Mathf.Lerp(0.08f, 0.19f, streak);
                    float g = Mathf.Lerp(0.13f, 0.30f, streak);
                    float b = Mathf.Lerp(0.07f, 0.11f, streak);

                    px[y * size + x] = new Color(r, g, b, 1f);
                }
            }

            return SavePngTexture(ToxicSumpTexPath, px, size, isNormal: false, alphaTransparency: false);
        }

        private static (Texture2D albedo, Texture2D normal) BakeDiamondPlateTextures(int size)
        {
            Color32[] albedoPx = new Color32[size * size];
            Color32[] normPx = new Color32[size * size];

            const float cellFreq = 16f;
            float[] heights = new float[size * size];

            for (int y = 0; y < size; y++)
            {
                float v = y / (float)size;
                for (int x = 0; x < size; x++)
                {
                    float u = x / (float)size;
                    float gu = u * cellFreq;
                    float gv = v * cellFreq;
                    int cellX = Mathf.FloorToInt(gu);
                    int cellY = Mathf.FloorToInt(gv);
                    float lu = (gu - cellX) - 0.5f;
                    float lv = (gv - cellY) - 0.5f;

                    // Alternate lug orientation 90 deg checkerboard
                    bool rot = ((cellX + cellY) & 1) == 0;
                    float ax = rot ? (lu + lv) * 0.707f : (lu - lv) * 0.707f;
                    float ay = rot ? (-lu + lv) * 0.707f : (lu + lv) * 0.707f;

                    float lug = Mathf.SmoothStep(0.06f, 0.0f, Mathf.Abs(ax) * 0.35f + Mathf.Abs(ay) * 1.15f - 0.16f);
                    float grime = Mathf.PerlinNoise(u * 10f + 1.5f, v * 10f + 3.2f);
                    heights[y * size + x] = lug;

                    float baseShade = Mathf.Lerp(0.15f, 0.23f, grime) + lug * 0.12f;
                    float rustHint = Mathf.SmoothStep(0.62f, 0.85f, grime) * 0.07f;
                    byte r = (byte)Mathf.Clamp(Mathf.RoundToInt((baseShade + rustHint) * 255f), 0, 255);
                    byte g = (byte)Mathf.Clamp(Mathf.RoundToInt((baseShade + rustHint * 0.4f) * 255f), 0, 255);
                    byte b = (byte)Mathf.Clamp(Mathf.RoundToInt((baseShade + 0.02f) * 255f), 0, 255);
                    albedoPx[y * size + x] = new Color32(r, g, b, 255);
                }
            }

            // Central-difference normal map from diamond lug heightfield
            for (int y = 0; y < size; y++)
            {
                int ym = (y - 1 + size) % size;
                int yp = (y + 1) % size;
                for (int x = 0; x < size; x++)
                {
                    int xm = (x - 1 + size) % size;
                    int xp = (x + 1) % size;

                    float dx = (heights[y * size + xp] - heights[y * size + xm]) * 1.8f;
                    float dy = (heights[yp * size + x] - heights[ym * size + x]) * 1.8f;
                    Vector3 n = new Vector3(-dx, -dy, 1f).normalized;
                    normPx[y * size + x] = new Color32(
                        (byte)Mathf.Clamp(Mathf.RoundToInt((n.x * 0.5f + 0.5f) * 255f), 0, 255),
                        (byte)Mathf.Clamp(Mathf.RoundToInt((n.y * 0.5f + 0.5f) * 255f), 0, 255),
                        (byte)Mathf.Clamp(Mathf.RoundToInt((n.z * 0.5f + 0.5f) * 255f), 0, 255),
                        255);
                }
            }

            Texture2D albedo = SavePngTexture(DiamondPlateTexPath, albedoPx, size, isNormal: false, alphaTransparency: false);
            Texture2D normal = SavePngTexture(DiamondPlateNormPath, normPx, size, isNormal: true, alphaTransparency: false);
            return (albedo, normal);
        }

        private static Texture2D BakeHazardStripeTexture(int size)
        {
            Color32 yellow = new Color32(0xD8, 0x9A, 0x19, 0xFF);
            Color32 black = new Color32(0x1E, 0x1F, 0x21, 0xFF);
            Color32 chip = new Color32(0x45, 0x47, 0x49, 0xFF);

            Color32[] px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                float v = y / (float)size;
                for (int x = 0; x < size; x++)
                {
                    float u = x / (float)size;
                    float diag = Mathf.Repeat((u + v) * 2f, 1f);
                    bool isYellow = diag < 0.5f;
                    float wear = Mathf.PerlinNoise(u * 18f + 4f, v * 18f + 9f);
                    if (wear > 0.78f && (v < 0.14f || v > 0.86f))
                    {
                        px[y * size + x] = chip;
                    }
                    else
                    {
                        Color32 src = isYellow ? yellow : black;
                        int d = Mathf.RoundToInt((wear - 0.5f) * 18f);
                        px[y * size + x] = new Color32(
                            (byte)Mathf.Clamp(src.r + d, 0, 255),
                            (byte)Mathf.Clamp(src.g + d, 0, 255),
                            (byte)Mathf.Clamp(src.b + d, 0, 255),
                            255);
                    }
                }
            }

            return SavePngTexture(HazardStripeTexPath, px, size, isNormal: false, alphaTransparency: false);
        }

        private static Texture2D BakeSoftGlowTexture(int size)
        {
            Color32[] px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                float ny = (y / (float)(size - 1)) * 2f - 1f;
                for (int x = 0; x < size; x++)
                {
                    float nx = (x / (float)(size - 1)) * 2f - 1f;
                    float r = Mathf.Clamp01(Mathf.Sqrt(nx * nx + ny * ny));
                    float falloff = Mathf.Pow(1f - r, 2.2f);
                    byte a = (byte)Mathf.Clamp(Mathf.RoundToInt(falloff * 255f), 0, 255);
                    px[y * size + x] = new Color32(255, 255, 255, a);
                }
            }

            return SavePngTexture(SoftGlowTexPath, px, size, isNormal: false, alphaTransparency: true);
        }

        private static Texture2D SavePngTexture(string assetPath, Color32[] pixels, int size, bool isNormal, bool alphaTransparency)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true, isNormal);
            tex.SetPixels32(pixels);
            tex.Apply(true, false);

            string fullPath = Path.GetFullPath(assetPath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
            File.WriteAllBytes(fullPath, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);

            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate);
            if (AssetImporter.GetAtPath(assetPath) is TextureImporter importer)
            {
                importer.textureType = isNormal ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.alphaIsTransparency = alphaTransparency && !isNormal;
                importer.wrapMode = isNormal || !alphaTransparency ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
                importer.filterMode = FilterMode.Bilinear;
                importer.mipmapEnabled = true;
                importer.textureCompression = TextureImporterCompression.Compressed;
                importer.SaveAndReimport();
            }

            return AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
        }

        private static Material LoadOrCreateMaterial(string path, Shader shader)
        {
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader) { name = Path.GetFileNameWithoutExtension(path) };
                AssetDatabase.CreateAsset(mat, path);
            }
            mat.shader = shader;
            return mat;
        }

        private static void EnsureMaterialsFolder()
        {
            if (!AssetDatabase.IsValidFolder("Assets/ShipyardCat"))
                AssetDatabase.CreateFolder("Assets", "ShipyardCat");
            if (!AssetDatabase.IsValidFolder(MaterialsDir))
                AssetDatabase.CreateFolder("Assets/ShipyardCat", "Materials");
        }
    }
}
