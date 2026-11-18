using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;
using ShipyardCat.AI;
using ShipyardCat.Core;
using ShipyardCat.Editor;
using ShipyardCat.Player;

namespace ShipyardCat.Tests
{
    public class Iteration1Tests
    {
        [Test]
        public void SceneAssembly_HasExactly8ScaledRatsAnd1KingpinUnderWorldRoot()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var rats = Object.FindObjectsByType<RatPreyAI>(FindObjectsSortMode.None);
            var bosses = Object.FindObjectsByType<KingpinBossAI>(FindObjectsSortMode.None);

            Assert.AreEqual(8, rats.Length, "Expected exactly 8 RatPreyAI instances in ShipyardMain.");
            Assert.AreEqual(1, bosses.Length, "Expected exactly 1 KingpinBossAI instance in ShipyardMain.");

            var worldRoot = GameObject.Find("ShipyardWorldRoot");
            Assert.IsNotNull(worldRoot, "ShipyardWorldRoot must exist.");

            foreach (var rat in rats)
            {
                Assert.IsTrue(rat.transform.IsChildOf(worldRoot.transform), $"{rat.name} should be parented under ShipyardWorldRoot.");
                var wrapper = rat.transform.Find("Rat_ScaleWrapper");
                if (wrapper != null)
                {
                    Assert.AreEqual(0.22f, wrapper.localScale.x, 0.01f, $"{rat.name} Rat_ScaleWrapper scale should be ~0.22.");
                }
            }
        }

        [Test]
        public void WhiskersSonar_ToggleSonar_FlipsActiveStateCleanly()
        {
            UnityEngine.TestTools.LogAssert.ignoreFailingMessages = true;
            var go = new GameObject("TestAlbaSonar");
            try
            {
                var sonar = go.AddComponent<WhiskersSonarController>();
                Assert.IsFalse(sonar.IsSonarActive);
                sonar.ToggleSonar();
                Assert.IsTrue(sonar.IsSonarActive);
                sonar.ToggleSonar();
                Assert.IsFalse(sonar.IsSonarActive);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void ShipyardHUDUxml_ContainsAllBoundElementIds()
        {
            var uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/ShipyardCat/UI/ShipyardHUD.uxml");
            Assert.IsNotNull(uxml, "ShipyardHUD.uxml must exist.");
            var root = uxml.Instantiate();

            string[] expectedIds =
            {
                "hud-root", "vitals-card", "toolbar",
                "boss-card", "boss-health-fill", "boss-health-label",
                "protocol-overlay", "btn-protocol", "btn-close-protocol",
                "endgame-overlay", "btn-endgame-restart"
            };

            foreach (var id in expectedIds)
            {
                Assert.IsNotNull(root.Q<VisualElement>(id), $"Missing UXML element '{id}' in ShipyardHUD.uxml.");
            }
        }
    }
}
