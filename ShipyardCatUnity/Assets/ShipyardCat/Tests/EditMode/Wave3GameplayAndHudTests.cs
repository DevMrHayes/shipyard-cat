using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;
using ShipyardCat.AI;
using ShipyardCat.Player;
using ShipyardCat.UI;

namespace ShipyardCat.Tests
{
    public class Wave3GameplayAndHudTests
    {
        [Test]
        public void Verify_PounceVisualizer_Generates32SegmentArcAndFriendlyTargetNames()
        {
            var go = new GameObject("TestPounceVis");
            try
            {
                var pounce = go.AddComponent<PounceTrajectoryVisualizer>();
                Assert.GreaterOrEqual(pounce.ConfiguredArcSegmentCount, 32, "Pounce arc should use >= 32 Hermite/parabolic curve segments.");
                Assert.AreEqual("DD1 Catwalk", PounceTrajectoryVisualizer.FormatFriendlyTargetName("DD1_CatwalkDeck"));
                Assert.AreEqual("Rail Flatcar", PounceTrajectoryVisualizer.FormatFriendlyTargetName("Flatcar_DeckPlanking"));
                Assert.AreEqual("Shipyard Apron", PounceTrajectoryVisualizer.FormatFriendlyTargetName("YardAsphalt_MainEastApron"));
                Assert.AreEqual("Keel Cribbing", PounceTrajectoryVisualizer.FormatFriendlyTargetName("TopKeelCap"));
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void Verify_SonarHighlights_AssignPhosphorGreenToPestsAndThermalAmberToKingpin()
        {
            Assert.IsTrue(WhiskersSonarController.TryGetHighlightColorForType("RatPreyAI", out Color ratColor));
            Assert.Greater(ratColor.g, ratColor.r, "RatPreyAI highlight must be phosphor-green (#52FF87 family).");

            Assert.IsTrue(WhiskersSonarController.TryGetHighlightColorForType("KingpinBossAI", out Color bossColor));
            Assert.Greater(bossColor.r, bossColor.b, "KingpinBossAI highlight must be thermal-amber (#FFA439 family).");
        }

        [Test]
        public void Verify_ProductionHud_HasRadarSweepAndKingpinTelegraphComponents()
        {
            var uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/ShipyardCat/UI/ShipyardHUD.uxml");
            Assert.IsNotNull(uxml);
            var root = uxml.Instantiate();
            Assert.IsNotNull(root.Q<VisualElement>("radar-sweep-line"), "Circular radar missing rotating radar-sweep-line.");

            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var kingpin = Object.FindAnyObjectByType<KingpinBossAI>();
            Assert.IsNotNull(kingpin);
            var rig = kingpin.GetComponent<KingpinArenaRig>();
            Assert.IsNotNull(rig, "KingpinArenaRig missing on DockyardKingpin_Boss.");
        }
    }
}
