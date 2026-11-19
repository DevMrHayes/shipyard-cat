using UnityEditor;
using UnityEngine;

namespace ShipyardCat.Editor
{
    /// <summary>
    /// Optimizes imported shipyard PBR textures and skyboxes for fast WebGL downloads and low VRAM.
    /// </summary>
    public static class WebGLAssetOptimizer
    {
        [MenuItem("ShipyardCat/Optimize Textures for WebGL")]
        public static void OptimizeForWebGL()
        {
            string[] textureGuids = AssetDatabase.FindAssets("t:Texture", new[] { "Assets/ShipyardCat/Imported" });
            int updated = 0;

            foreach (string guid in textureGuids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null) continue;

                int targetMaxSize = path.Contains("evening_sky") || path.Contains("asphalt_diff") ? 1024 : 512;
                var webglSettings = importer.GetPlatformTextureSettings("WebGL");
                bool changed = false;

                if (!webglSettings.overridden || webglSettings.maxTextureSize > targetMaxSize)
                {
                    webglSettings.overridden = true;
                    webglSettings.maxTextureSize = targetMaxSize;
                    webglSettings.compressionQuality = 60;
                    webglSettings.format = TextureImporterFormat.DXT5Crunched;
                    importer.SetPlatformTextureSettings(webglSettings);
                    changed = true;
                }

                if (!importer.crunchedCompression && !path.EndsWith(".hdr"))
                {
                    importer.crunchedCompression = true;
                    importer.compressionQuality = 65;
                    changed = true;
                }

                if (changed)
                {
                    importer.SaveAndReimport();
                    updated++;
                }
            }

            Debug.Log($"[WebGLAssetOptimizer] Audited {textureGuids.Length} imported textures; updated {updated} WebGL settings.");
        }
    }
}
