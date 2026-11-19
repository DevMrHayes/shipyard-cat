using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;
using ShipyardCat.Core;
using ShipyardCat.Player;
using ShipyardCat.UI;
using ShipyardCat.World;

namespace ShipyardCat.Tests
{
    public class Iteration6To8GameplayTests
    {
        [Test]
        public void WhiskersSonar_Exposes4ConcentricRings()
        {
            var go = new GameObject("TestSonarRings");
            try
            {
                var sonar = go.AddComponent<WhiskersSonarController>();
                Assert.GreaterOrEqual(sonar.ActiveRingCount, 4, "Sonar must render at least 4 staggered concentric rings.");
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
        public void HUDUxml_HasMinimalVitalsCircularRadarAndLogbook()
        {
            var uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/ShipyardCat/UI/ShipyardHUD.uxml");
            Assert.IsNotNull(uxml);
            var root = uxml.Instantiate();

            string[] conceptIds =
            {
                "vitals-card", "mission-card", "radar-card", "radar-circle", "radar-blips-layer",
                "radar-player-arrow", "contextual-prompt-bar", "contextual-prompt-label",
                "logbook-overlay", "btn-logbook", "btn-close-logbook",
                "btn-perk-agility", "btn-perk-stealth", "btn-perk-combat", "btn-perk-rad"
            };
            foreach (var id in conceptIds)
            {
                Assert.IsNotNull(root.Q<VisualElement>(id), $"Missing concept HUD element '{id}'.");
            }
        }

        [Test]
        public void Scene_HasProgressBridgeAndCollectibles()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            Assert.IsNotNull(Object.FindAnyObjectByType<ShipyardProgressBridge>(), "ShipyardProgressBridge missing on ShipyardManagers.");
            var collectibles = Object.FindObjectsByType<CollectibleItem>(FindObjectsSortMode.None);
            Assert.GreaterOrEqual(collectibles.Length, 4, "Expected at least 4 narrative collectibles in ShipyardMain.");
        }

        [Test]
        public void CollectibleItem_TryCollect_GrantsHealthAndMarksCollected()
        {
            var goV = new GameObject("TestVitals");
            var goC = new GameObject("TestCollectible");
            try
            {
                var vitals = goV.AddComponent<CatVitals>();
                vitals.ResetVitals();
                vitals.TakeDamage(40f);
                float damaged = vitals.Health;

                var item = goC.AddComponent<CollectibleItem>();
                item.Configure("test_item", "Test Pass", "", 150, 25f);
                bool collected = item.TryCollect(vitals);

                Assert.IsTrue(collected);
                Assert.IsTrue(item.IsCollected);
                Assert.Greater(vitals.Health, damaged);
            }
            finally
            {
                Object.DestroyImmediate(goV);
                Object.DestroyImmediate(goC);
            }
        }

        [Test]
        public void Scene_HasPersistedNavMeshDataAsset()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var surface = Object.FindAnyObjectByType<Unity.AI.Navigation.NavMeshSurface>();
            Assert.IsNotNull(surface, "NavMeshSurface missing in ShipyardMain.");
            Assert.IsNotNull(surface.navMeshData, "NavMeshSurface.navMeshData must not be null.");
            Assert.IsTrue(AssetDatabase.Contains(surface.navMeshData), "NavMeshData must be persisted as an asset for WebGL builds.");
        }
    }
}
