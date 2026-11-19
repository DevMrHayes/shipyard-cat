using System.IO;
using UnityEditor;
using UnityEngine;

namespace ShipyardCat.Editor
{
    /// <summary>
    /// Samples cat.glb vertices in raw bind-pose coordinate space directly from smr.sharedMesh and bakes a
    /// UV-island-dilated tuxedo coat texture so Alba never exhibits UV-mismatched back stripes.
    /// </summary>
    public static class AlbaTuxedoBaker
    {
        private const string MaterialsDir = "Assets/ShipyardCat/Materials";
        public const string BakedTexPath = MaterialsDir + "/Alba_Tuxedo_Baked.png";
        public const string BakedMatPath = MaterialsDir + "/Alba_Tuxedo_Mat.mat";

        public static Material BakeAndPersistTuxedoMaterial(GameObject instantiatedAlbaRoot)
        {
            EnsureMaterialsFolder();

            SkinnedMeshRenderer smr = instantiatedAlbaRoot != null
                ? instantiatedAlbaRoot.GetComponentInChildren<SkinnedMeshRenderer>(true)
                : null;

            Texture2D tex = smr != null
                ? BakeFromSkinnedMesh(smr, true)
                : BakeTuxedoTexture(instantiatedAlbaRoot);

            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            Material mat = AssetDatabase.LoadAssetAtPath<Material>(BakedMatPath);
            if (mat == null)
            {
                mat = new Material(urpLit) { name = "Alba_Tuxedo_Mat" };
                AssetDatabase.CreateAsset(mat, BakedMatPath);
            }

            mat.shader = urpLit;
            if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", tex);
            if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", tex);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.white);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0.0f);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.28f);
            EditorUtility.SetDirty(mat);
            return mat;
        }

        public static Texture2D EnsureBakedTextureAsset(SkinnedMeshRenderer smr)
        {
            EnsureMaterialsFolder();
            if (smr != null)
            {
                return BakeFromSkinnedMesh(smr, true);
            }

            Texture2D existing = AssetDatabase.LoadAssetAtPath<Texture2D>(BakedTexPath);
            if (existing != null)
            {
                return existing;
            }

            return BakeTuxedoTexture(null);
        }

        public static void ApplyTuxedoMaterialToRenderer(SkinnedMeshRenderer smr)
        {
            if (smr == null) return;
            EnsureMaterialsFolder();

            Texture2D tex = BakeFromSkinnedMesh(smr, true);
            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            Material mat = AssetDatabase.LoadAssetAtPath<Material>(BakedMatPath);
            if (mat == null)
            {
                mat = new Material(urpLit) { name = "Alba_Tuxedo_Mat" };
                AssetDatabase.CreateAsset(mat, BakedMatPath);
            }

            mat.shader = urpLit;
            if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", tex);
            if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", tex);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.white);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0.0f);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.28f);
            EditorUtility.SetDirty(mat);

            smr.sharedMaterial = mat;
            EditorUtility.SetDirty(smr);
        }

        public static Texture2D BakeFromSkinnedMesh(SkinnedMeshRenderer smr, bool forceRebuild = false)
        {
            EnsureMaterialsFolder();

            if (!forceRebuild)
            {
                Texture2D existing = AssetDatabase.LoadAssetAtPath<Texture2D>(BakedTexPath);
                if (existing != null)
                {
                    return existing;
                }
            }

            const int size = 512;
            Color32 charcoalBlack = new Color32(0x18, 0x19, 0x1B, 0xFF);
            Color32 tuxedoWhite = new Color32(0xEC, 0xEF, 0xF4, 0xFF);
            Color32 pinkNose = new Color32(0xEC, 0xA8, 0xA9, 0xFF);

            Color32[] pixels = new Color32[size * size];
            bool[] painted = new bool[size * size];

            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = charcoalBlack;
            }

            if (smr != null && smr.sharedMesh != null)
            {
                Mesh sharedMesh = smr.sharedMesh;
                Vector3[] verts = sharedMesh.vertices;
                Vector3[] norms = sharedMesh.normals;
                Vector2[] uvs = sharedMesh.uv;
                int[] tris = sharedMesh.triangles;

                float minY = float.MaxValue, maxY = float.MinValue;
                float minZ = float.MaxValue, maxZ = float.MinValue;
                float maxAbsX = 0.001f;

                for (int i = 0; i < verts.Length; i++)
                {
                    Vector3 v = verts[i];
                    if (v.y < minY) minY = v.y;
                    if (v.y > maxY) maxY = v.y;
                    if (v.z < minZ) minZ = v.z;
                    if (v.z > maxZ) maxZ = v.z;

                    float ax = Mathf.Abs(v.x);
                    if (ax > maxAbsX) maxAbsX = ax;
                }

                float height = Mathf.Max(0.001f, maxY - minY);
                float length = Mathf.Max(0.001f, maxZ - minZ);

                Color32[] vertColors = new Color32[verts.Length];
                for (int i = 0; i < verts.Length; i++)
                {
                    Vector3 v = verts[i];
                    Vector3 n = (norms != null && i < norms.Length) ? norms[i] : Vector3.up;

                    float yNorm = (v.y - minY) / height;
                    float zNorm = (v.z - minZ) / length;
                    float xNorm = Mathf.Abs(v.x) / maxAbsX;

                    bool isDorsalBack = (yNorm > 0.50f && zNorm < 0.78f && (n.y > 0.15f || yNorm > 0.58f)) || zNorm < 0.30f;
                    bool isWhiteMittens = !isDorsalBack && yNorm < 0.16f && zNorm >= 0.30f;
                    bool isWhiteChestBib = !isDorsalBack && zNorm > 0.42f && zNorm < 0.88f && xNorm < 0.58f && (yNorm < 0.42f || (yNorm < 0.64f && zNorm > 0.66f));
                    bool isWhiteMuzzle = !isDorsalBack && zNorm >= 0.86f && yNorm < 0.74f && xNorm < 0.40f;
                    bool isPinkNose = zNorm > 0.965f && yNorm >= 0.66f && yNorm < 0.78f && xNorm < 0.22f;

                    if (isPinkNose)
                    {
                        vertColors[i] = pinkNose;
                    }
                    else if (isWhiteMittens || isWhiteChestBib || isWhiteMuzzle)
                    {
                        vertColors[i] = tuxedoWhite;
                    }
                    else
                    {
                        vertColors[i] = charcoalBlack;
                    }
                }

                for (int t = 0; t + 2 < tris.Length; t += 3)
                {
                    int i0 = tris[t];
                    int i1 = tris[t + 1];
                    int i2 = tris[t + 2];

                    if (i0 >= uvs.Length || i1 >= uvs.Length || i2 >= uvs.Length) continue;

                    RasterizeTriangle(pixels, painted, size, uvs[i0], uvs[i1], uvs[i2], vertColors[i0], vertColors[i1], vertColors[i2]);
                }

                DilateMask(pixels, painted, size, passes: 4);
            }

            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true);
            tex.SetPixels32(pixels);
            tex.Apply(true, false);

            string fullPath = Path.GetFullPath(BakedTexPath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
            File.WriteAllBytes(fullPath, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);

            AssetDatabase.ImportAsset(BakedTexPath, ImportAssetOptions.ForceUpdate);
            if (AssetImporter.GetAtPath(BakedTexPath) is TextureImporter importer)
            {
                importer.textureType = TextureImporterType.Default;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.filterMode = FilterMode.Bilinear;
                importer.mipmapEnabled = true;
                importer.textureCompression = TextureImporterCompression.Compressed;
                importer.SaveAndReimport();
            }

            return AssetDatabase.LoadAssetAtPath<Texture2D>(BakedTexPath);
        }

        private static Texture2D BakeTuxedoTexture(GameObject albaRoot)
        {
            SkinnedMeshRenderer smr = albaRoot != null ? albaRoot.GetComponentInChildren<SkinnedMeshRenderer>(true) : null;
            return BakeFromSkinnedMesh(smr, true);
        }

        private static void RasterizeTriangle(
            Color32[] pixels,
            bool[] painted,
            int size,
            Vector2 uv0,
            Vector2 uv1,
            Vector2 uv2,
            Color32 c0,
            Color32 c1,
            Color32 c2)
        {
            Vector2 p0 = new Vector2(Mathf.Repeat(uv0.x, 1.0001f) * (size - 1), Mathf.Repeat(uv0.y, 1.0001f) * (size - 1));
            Vector2 p1 = new Vector2(Mathf.Repeat(uv1.x, 1.0001f) * (size - 1), Mathf.Repeat(uv1.y, 1.0001f) * (size - 1));
            Vector2 p2 = new Vector2(Mathf.Repeat(uv2.x, 1.0001f) * (size - 1), Mathf.Repeat(uv2.y, 1.0001f) * (size - 1));

            int minX = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(p0.x, Mathf.Min(p1.x, p2.x))));
            int maxX = Mathf.Min(size - 1, Mathf.CeilToInt(Mathf.Max(p0.x, Mathf.Max(p1.x, p2.x))));
            int minY = Mathf.Max(0, Mathf.FloorToInt(Mathf.Min(p0.y, Mathf.Min(p1.y, p2.y))));
            int maxY = Mathf.Min(size - 1, Mathf.CeilToInt(Mathf.Max(p0.y, Mathf.Max(p1.y, p2.y))));

            float denom = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y);
            if (Mathf.Abs(denom) < 1e-4f) return;

            for (int y = minY; y <= maxY; y++)
            {
                for (int x = minX; x <= maxX; x++)
                {
                    float w0 = ((p1.y - p2.y) * (x - p2.x) + (p2.x - p1.x) * (y - p2.y)) / denom;
                    float w1 = ((p2.y - p0.y) * (x - p2.x) + (p0.x - p2.x) * (y - p2.y)) / denom;
                    float w2 = 1f - w0 - w1;
                    if (w0 < -0.02f || w1 < -0.02f || w2 < -0.02f) continue;

                    w0 = Mathf.Clamp01(w0);
                    w1 = Mathf.Clamp01(w1);
                    w2 = Mathf.Clamp01(w2);
                    float sum = w0 + w1 + w2;
                    if (sum > 0f) { w0 /= sum; w1 /= sum; w2 /= sum; }

                    int idx = y * size + x;
                    pixels[idx] = new Color32(
                        (byte)Mathf.Clamp(Mathf.RoundToInt(c0.r * w0 + c1.r * w1 + c2.r * w2), 0, 255),
                        (byte)Mathf.Clamp(Mathf.RoundToInt(c0.g * w0 + c1.g * w1 + c2.g * w2), 0, 255),
                        (byte)Mathf.Clamp(Mathf.RoundToInt(c0.b * w0 + c1.b * w1 + c2.b * w2), 0, 255),
                        255);
                    painted[idx] = true;
                }
            }
        }

        private static void DilateMask(Color32[] pixels, bool[] painted, int size, int passes)
        {
            for (int pass = 0; pass < passes; pass++)
            {
                bool[] nextPainted = (bool[])painted.Clone();
                Color32[] nextPixels = (Color32[])pixels.Clone();

                for (int y = 0; y < size; y++)
                {
                    for (int x = 0; x < size; x++)
                    {
                        int idx = y * size + x;
                        if (painted[idx]) continue;

                        int rSum = 0, gSum = 0, bSum = 0, count = 0;
                        for (int dy = -1; dy <= 1; dy++)
                        {
                            int ny = y + dy;
                            if (ny < 0 || ny >= size) continue;
                            for (int dx = -1; dx <= 1; dx++)
                            {
                                int nx = x + dx;
                                if (nx < 0 || nx >= size) continue;
                                int nIdx = ny * size + nx;
                                if (!painted[nIdx]) continue;
                                rSum += pixels[nIdx].r;
                                gSum += pixels[nIdx].g;
                                bSum += pixels[nIdx].b;
                                count++;
                            }
                        }

                        if (count > 0)
                        {
                            nextPixels[idx] = new Color32((byte)(rSum / count), (byte)(gSum / count), (byte)(bSum / count), 255);
                            nextPainted[idx] = true;
                        }
                    }
                }

                System.Array.Copy(nextPixels, pixels, pixels.Length);
                System.Array.Copy(nextPainted, painted, painted.Length);
            }
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
