using System.IO;
using UnityEditor;
using UnityEngine;

namespace ShipyardCat.Editor
{
    /// <summary>
    /// Samples cat.glb vertices in 3D anatomical coordinates (Alba_Player local space) and bakes a
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

            Texture2D tex = BakeTuxedoTexture(instantiatedAlbaRoot);
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

        private static Texture2D BakeTuxedoTexture(GameObject albaRoot)
        {
            const int size = 512;
            Color32 charcoal = new Color32(0x18, 0x19, 0x1B, 0xFF);
            Color32 whiteFur = new Color32(0xE8, 0xE9, 0xEC, 0xFF);
            Color32 nosePink = new Color32(0xEC, 0xA8, 0xA9, 0xFF);

            Color32[] pixels = new Color32[size * size];
            bool[] painted = new bool[size * size];

            // Default base coat everywhere to charcoal (eliminates white stripes if any UV pixel falls outside triangles)
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = charcoal;
            }

            SkinnedMeshRenderer smr = albaRoot != null ? albaRoot.GetComponentInChildren<SkinnedMeshRenderer>(true) : null;
            if (smr != null && smr.sharedMesh != null && albaRoot != null)
            {
                Mesh bakedMesh = new Mesh();
                smr.BakeMesh(bakedMesh);

                Vector3[] verts = bakedMesh.vertices;
                Vector3[] normals = bakedMesh.normals;
                Vector2[] uvs = bakedMesh.uv;
                int[] tris = bakedMesh.triangles;

                // Determine anatomical forward axis in albaRoot local space via pelvis -> head bones
                Transform headBone = FindBone(albaRoot.transform, "RigHead_017", "Head");
                Transform pelvisBone = FindBone(albaRoot.transform, "RigPelvis_01", "Pelvis");

                Vector3 forwardDir = Vector3.forward;
                if (headBone != null && pelvisBone != null)
                {
                    Vector3 delta = albaRoot.transform.InverseTransformPoint(headBone.position)
                                  - albaRoot.transform.InverseTransformPoint(pelvisBone.position);
                    delta.y = 0f;
                    if (delta.sqrMagnitude > 0.0001f)
                    {
                        forwardDir = delta.normalized;
                    }
                }
                Vector3 rightDir = Vector3.Cross(Vector3.up, forwardDir).normalized;

                Matrix4x4 smrToAlba = albaRoot.transform.worldToLocalMatrix * smr.transform.localToWorldMatrix;

                Vector3[] albaPos = new Vector3[verts.Length];
                Vector3[] albaNorm = new Vector3[verts.Length];
                float minY = float.MaxValue, maxY = float.MinValue;
                float minF = float.MaxValue, maxF = float.MinValue;

                for (int i = 0; i < verts.Length; i++)
                {
                    Vector3 p = smrToAlba.MultiplyPoint3x4(verts[i]);
                    Vector3 n = normals != null && i < normals.Length
                        ? smrToAlba.MultiplyVector(normals[i]).normalized
                        : Vector3.up;

                    albaPos[i] = p;
                    albaNorm[i] = n;

                    float f = Vector3.Dot(p, forwardDir);
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                    if (f < minF) minF = f;
                    if (f > maxF) maxF = f;
                }

                float height = Mathf.Max(0.1f, maxY - minY);
                float length = Mathf.Max(0.1f, maxF - minF);

                for (int t = 0; t + 2 < tris.Length; t += 3)
                {
                    int i0 = tris[t];
                    int i1 = tris[t + 1];
                    int i2 = tris[t + 2];
                    if (i0 >= uvs.Length || i1 >= uvs.Length || i2 >= uvs.Length) continue;

                    Color32 c0 = EvaluateVertexFurColor(albaPos[i0], albaNorm[i0], minY, height, minF, length, forwardDir, rightDir, charcoal, whiteFur, nosePink);
                    Color32 c1 = EvaluateVertexFurColor(albaPos[i1], albaNorm[i1], minY, height, minF, length, forwardDir, rightDir, charcoal, whiteFur, nosePink);
                    Color32 c2 = EvaluateVertexFurColor(albaPos[i2], albaNorm[i2], minY, height, minF, length, forwardDir, rightDir, charcoal, whiteFur, nosePink);

                    RasterizeTriangle(pixels, painted, size, uvs[i0], uvs[i1], uvs[i2], c0, c1, c2);
                }

                // 3-pass UV island dilation so mipmaps never bleed background texels
                DilatePaintedTexels(pixels, painted, size, passes: 3);
                Object.DestroyImmediate(bakedMesh);
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

        private static Color32 EvaluateVertexFurColor(
            Vector3 p,
            Vector3 n,
            float minY,
            float height,
            float minF,
            float length,
            Vector3 forwardDir,
            Vector3 rightDir,
            Color32 charcoal,
            Color32 whiteFur,
            Color32 nosePink)
        {
            float yNorm = (p.y - minY) / height;
            float fNorm = (Vector3.Dot(p, forwardDir) - minF) / length;
            float latAbs = Mathf.Abs(Vector3.Dot(p, rightDir)) / length;

            // Strict dorsal crown/back protection: top surfaces behind upper neck remain charcoal black (never stripes!)
            bool isBackProtected = yNorm > 0.42f && n.y > -0.18f && fNorm < 0.88f;

            bool isWhite = false;
            // 1. Crisp white paw "socks" near bottom
            if (yNorm < 0.16f && fNorm > 0.25f)
            {
                isWhite = true;
            }
            // 2. Clean ventral chest bib & underside belly
            if (!isBackProtected && fNorm > 0.35f && fNorm < 0.84f && latAbs < 0.095f && (n.y < -0.20f || (yNorm < 0.56f && Vector3.Dot(n, forwardDir) > 0.25f)))
            {
                isWhite = true;
            }
            // 3. Lower muzzle, chin & narrow nose bridge blaze (concept l1bvfr)
            if (fNorm >= 0.84f && latAbs < 0.055f && yNorm < 0.72f)
            {
                isWhite = true;
            }

            // Tiny pink nose leather at very tip of muzzle
            if (fNorm > 0.965f && latAbs < 0.022f && yNorm > 0.56f && yNorm < 0.72f)
            {
                return nosePink;
            }

            // Subtle deterministic micro-strand variation
            float grain = Mathf.Sin(p.x * 180f + p.z * 90f) * Mathf.Cos(p.y * 140f);
            Color32 c = isWhite ? whiteFur : charcoal;
            int d = Mathf.RoundToInt(grain * 3.0f);
            return new Color32(
                (byte)Mathf.Clamp(c.r + d, 0, 255),
                (byte)Mathf.Clamp(c.g + d, 0, 255),
                (byte)Mathf.Clamp(c.b + d, 0, 255),
                255);
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

        private static void DilatePaintedTexels(Color32[] pixels, bool[] painted, int size, int passes)
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

        private static Transform FindBone(Transform root, string primary, string fallbackToken)
        {
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
            {
                if (t.name.Contains(primary)) return t;
            }
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
            {
                if (t.name.ToLowerInvariant().Contains(fallbackToken.ToLowerInvariant())) return t;
            }
            return null;
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
