using System.IO;
using UnityEditor;
using UnityEngine;

namespace ShipyardCat.Editor
{
    /// <summary>
    /// Generates and persists crisp anti-aliased RGBA32 sign textures for world-space 3D URP signage
    /// so Big Blue and CVN-80 hull markings render with proper ZTest/CullBack depth occlusion.
    /// </summary>
    public static class SignTextureBaker
    {
        private const string MaterialsDir = "Assets/ShipyardCat/Materials";
        public const string BigBlueSignTexPath = MaterialsDir + "/BigBlue_Sign_Tex.png";
        public const string Cvn80Hull80TexPath = MaterialsDir + "/CVN80_Hull80_Tex.png";

        // 5x7 crisp bitmap font definitions for uppercase ASCII characters used on shipyard signs
        private static readonly (char ch, string[] rows)[] Font5x7 =
        {
            ('N', new[] { "10001", "11001", "10101", "10011", "10001", "10001", "10001" }),
            ('E', new[] { "11111", "10000", "10000", "11110", "10000", "10000", "11111" }),
            ('W', new[] { "10001", "10001", "10001", "10101", "10101", "11011", "10001" }),
            ('P', new[] { "11110", "10001", "10001", "11110", "10000", "10000", "10000" }),
            ('O', new[] { "01110", "10001", "10001", "10001", "10001", "10001", "01110" }),
            ('R', new[] { "11110", "10001", "10001", "11110", "10100", "10010", "10001" }),
            ('T', new[] { "11111", "00100", "00100", "00100", "00100", "00100", "00100" }),
            ('S', new[] { "01111", "10000", "10000", "01110", "00001", "00001", "11110" }),
            ('H', new[] { "10001", "10001", "10001", "11111", "10001", "10001", "10001" }),
            ('I', new[] { "11111", "00100", "00100", "00100", "00100", "00100", "11111" }),
            ('B', new[] { "11110", "10001", "10001", "11110", "10001", "10001", "11110" }),
            ('U', new[] { "10001", "10001", "10001", "10001", "10001", "10001", "01110" }),
            ('L', new[] { "10000", "10000", "10000", "10000", "10000", "10000", "11111" }),
            ('D', new[] { "11110", "10001", "10001", "10001", "10001", "10001", "11110" }),
            ('G', new[] { "01111", "10000", "10000", "10111", "10001", "10001", "01111" }),
            ('8', new[] { "01110", "10001", "10001", "01110", "10001", "10001", "01110" }),
            ('0', new[] { "01110", "10011", "10101", "10101", "11001", "10001", "01110" }),
            (' ', new[] { "00000", "00000", "00000", "00000", "00000", "00000", "00000" }),
        };

        public static (Texture2D bigBlueTex, Texture2D hull80Tex) BakeAllSignTextures()
        {
            EnsureMaterialsFolder();

            Texture2D bigBlue = BakeSignPng(
                BigBlueSignTexPath,
                "NEWPORT NEWS SHIPBUILDING",
                width: 2048,
                height: 256,
                fgColor: new Color32(0xEC, 0xEF, 0xF4, 0xFF),
                outlineColor: new Color32(0x0B, 0x15, 0x24, 0xFF),
                outlinePx: 4);

            Texture2D hull80 = BakeSignPng(
                Cvn80Hull80TexPath,
                "80",
                width: 512,
                height: 512,
                fgColor: new Color32(0xF4, 0xF6, 0xF8, 0xFF),
                outlineColor: new Color32(0x10, 0x16, 0x1E, 0xFF),
                outlinePx: 8);

            return (bigBlue, hull80);
        }

        private static Texture2D BakeSignPng(
            string assetPath,
            string text,
            int width,
            int height,
            Color32 fgColor,
            Color32 outlineColor,
            int outlinePx)
        {
            bool[] mask = new bool[width * height];

            int charCount = text.Length;
            float usableW = width * 0.90f;
            float usableH = height * 0.68f;
            float unitsW = charCount * 5f + Mathf.Max(0, charCount - 1) * 1.35f;
            float scale = Mathf.Min(usableW / unitsW, usableH / 7f);

            float totalW = unitsW * scale;
            float totalH = 7f * scale;
            float startX = (width - totalW) * 0.5f;
            float startY = (height - totalH) * 0.5f;

            // Bolden stroke slightly inside glyph cells for crisp distance legibility
            float cellExpand = 0.08f;

            for (int c = 0; c < charCount; c++)
            {
                string[] rows = FindGlyph(text[c]);
                float gx = startX + c * 6.35f * scale;

                for (int r = 0; r < 7; r++)
                {
                    int flippedRow = 6 - r; // Unity texture Y=0 is bottom
                    string line = rows[r];
                    for (int col = 0; col < 5; col++)
                    {
                        if (line[col] != '1') continue;

                        int x0 = Mathf.Max(0, Mathf.FloorToInt(gx + (col - cellExpand) * scale));
                        int x1 = Mathf.Min(width - 1, Mathf.CeilToInt(gx + (col + 1f + cellExpand) * scale));
                        int y0 = Mathf.Max(0, Mathf.FloorToInt(startY + (flippedRow - cellExpand) * scale));
                        int y1 = Mathf.Min(height - 1, Mathf.CeilToInt(startY + (flippedRow + 1f + cellExpand) * scale));

                        for (int py = y0; py <= y1; py++)
                        {
                            int rowBase = py * width;
                            for (int px = x0; px <= x1; px++)
                            {
                                mask[rowBase + px] = true;
                            }
                        }
                    }
                }
            }

            Color32[] pixels = new Color32[width * height];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = new Color32(outlineColor.r, outlineColor.g, outlineColor.b, 0);
            }

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int idx = y * width + x;
                    if (mask[idx])
                    {
                        pixels[idx] = fgColor;
                        continue;
                    }

                    // Check outline neighborhood for dark contrast halo around white letters
                    bool nearFg = false;
                    int xMin = Mathf.Max(0, x - outlinePx);
                    int xMax = Mathf.Min(width - 1, x + outlinePx);
                    int yMin = Mathf.Max(0, y - outlinePx);
                    int yMax = Mathf.Min(height - 1, y + outlinePx);
                    for (int ny = yMin; ny <= yMax && !nearFg; ny++)
                    {
                        int nRow = ny * width;
                        for (int nx = xMin; nx <= xMax; nx++)
                        {
                            if (mask[nRow + nx])
                            {
                                nearFg = true;
                                break;
                            }
                        }
                    }

                    if (nearFg)
                    {
                        pixels[idx] = outlineColor;
                    }
                }
            }

            var tex = new Texture2D(width, height, TextureFormat.RGBA32, false);
            tex.SetPixels32(pixels);
            tex.Apply(false, false);

            string fullPath = Path.GetFullPath(assetPath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
            File.WriteAllBytes(fullPath, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);

            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate);
            if (AssetImporter.GetAtPath(assetPath) is TextureImporter importer)
            {
                importer.textureType = TextureImporterType.Default;
                importer.alphaIsTransparency = true;
                importer.mipmapEnabled = true;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.filterMode = FilterMode.Bilinear;
                importer.anisoLevel = 4;
                importer.textureCompression = TextureImporterCompression.Compressed;
                importer.SaveAndReimport();
            }

            return AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
        }

        private static string[] FindGlyph(char c)
        {
            char upper = char.ToUpperInvariant(c);
            for (int i = 0; i < Font5x7.Length; i++)
            {
                if (Font5x7[i].ch == upper)
                {
                    return Font5x7[i].rows;
                }
            }
            return Font5x7[Font5x7.Length - 1].rows;
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
