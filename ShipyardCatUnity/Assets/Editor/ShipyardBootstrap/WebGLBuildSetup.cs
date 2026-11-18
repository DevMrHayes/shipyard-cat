using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace ShipyardCat.Editor
{
    public static class WebGLBuildSetup
    {
        [MenuItem("ShipyardCat/Apply WebGL Release Settings")]
        public static string ApplySettings()
        {
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.decompressionFallback = true; // Safe for Firebase Hosting default static headers
            PlayerSettings.stripEngineCode = true;
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.Medium);
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.nameFilesAsHashes = true;
            UnityEditor.WebGL.UserBuildSettings.codeOptimization = UnityEditor.WebGL.WasmCodeOptimization.BuildTimes;
            Application.targetFrameRate = -1;

            AssetDatabase.SaveAssets();

            return $"WebGL settings saved: Compression={PlayerSettings.WebGL.compressionFormat}, " +
                   $"DecompressionFallback={PlayerSettings.WebGL.decompressionFallback}, " +
                   $"StripEngineCode={PlayerSettings.stripEngineCode}, " +
                   $"ManagedStripping={PlayerSettings.GetManagedStrippingLevel(NamedBuildTarget.WebGL)}";
        }

        public static void BuildWebGL()
        {
            ApplySettings();

            string outputPath = ResolveOutputArg() ?? Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "webgl-dist"));
            Directory.CreateDirectory(outputPath);

            var scenes = new[] { "Assets/Scenes/ShipyardMain.unity" };
            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outputPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary summary = report.summary;

            if (summary.result == BuildResult.Succeeded)
            {
                Debug.Log($"[ShipyardCat] WebGL Build Succeeded: {summary.totalSize} bytes -> {outputPath}");
            }
            else
            {
                Debug.LogError($"[ShipyardCat] WebGL Build Failed: {summary.result} (errors: {summary.totalErrors})");
                EditorApplication.Exit(1);
            }
        }

        private static string ResolveOutputArg()
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--output" || args[i] == "-output")
                    return args[i + 1];
            }
            return null;
        }
    }
}
