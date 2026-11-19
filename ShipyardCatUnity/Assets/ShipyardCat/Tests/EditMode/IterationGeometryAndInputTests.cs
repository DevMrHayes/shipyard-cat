using System.Collections.Generic;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using ShipyardCat.Player;

namespace ShipyardCat.Tests
{
    public class IterationGeometryAndInputTests
    {
        [Test]
        public void Scene_HasZeroCoplanarGroundZFightingOverlaps()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var renderers = Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None);

            var groundSurfaces = new List<(string name, Bounds bounds)>();
            foreach (var r in renderers)
            {
                if (!r.enabled || !r.gameObject.activeInHierarchy) continue;
                var b = r.bounds;
                float areaXZ = b.size.x * b.size.z;
                if (areaXZ > 4f && Mathf.Abs(b.max.y) < 0.03f)
                {
                    groundSurfaces.Add((r.gameObject.name, b));
                }
            }

            Assert.GreaterOrEqual(groundSurfaces.Count, 5, "Expected cutout yard asphalt strips near Y=0.");

            for (int i = 0; i < groundSurfaces.Count; i++)
            {
                for (int j = i + 1; j < groundSurfaces.Count; j++)
                {
                    var a = groundSurfaces[i];
                    var b = groundSurfaces[j];
                    if (Mathf.Abs(a.bounds.max.y - b.bounds.max.y) > 0.03f) continue;

                    float overlapX = Mathf.Min(a.bounds.max.x, b.bounds.max.x) - Mathf.Max(a.bounds.min.x, b.bounds.min.x);
                    float overlapZ = Mathf.Min(a.bounds.max.z, b.bounds.max.z) - Mathf.Max(a.bounds.min.z, b.bounds.min.z);
                    bool substantialOverlap = overlapX > 0.05f && overlapZ > 0.05f;
                    Assert.IsFalse(substantialOverlap,
                        $"Z-fighting overlap near Y=0 between '{a.name}' and '{b.name}' (overlapX={overlapX:F2}, overlapZ={overlapZ:F2}).");
                }
            }
        }

        [Test]
        public void AlbaController_ComputeMoveInput_RespondsOnlyToWASD()
        {
            Assert.AreEqual(Vector2.zero, AlbaController.ComputeMoveInput(false, false, false, false));
            Assert.AreEqual(Vector2.up, AlbaController.ComputeMoveInput(true, false, false, false));
            Assert.AreEqual(Vector2.left, AlbaController.ComputeMoveInput(false, false, true, false));
            Assert.AreEqual(Vector2.right, AlbaController.ComputeMoveInput(false, false, false, true));
            Assert.AreEqual(Vector2.down, AlbaController.ComputeMoveInput(false, true, false, false));
        }

        [Test]
        public void AlbaController_ReadMoveInput_SourceHasNoArrowKeyBindings()
        {
            string path = System.IO.Path.GetFullPath("Assets/ShipyardCat/Scripts/Player/AlbaController.cs");
            string src = System.IO.File.ReadAllText(path);
            Assert.IsFalse(src.Contains("ArrowKey"), "AlbaController must NOT bind Arrow keys to Alba movement; Arrows belong exclusively to AlbaCameraRig.");
        }
    }
}
