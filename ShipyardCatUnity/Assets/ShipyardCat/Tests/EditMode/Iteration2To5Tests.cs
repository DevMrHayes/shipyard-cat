using System.Collections.Generic;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using ShipyardCat.AI;
using ShipyardCat.Core;
using ShipyardCat.Player;
using ShipyardCat.UI;
using ShipyardCat.World;

namespace ShipyardCat.Tests
{
    public class Iteration2To5Tests
    {
        [Test]
        public void ShipyardMain_HasLandmarksAndNewEcosystemActors()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            Assert.IsNotNull(Object.FindAnyObjectByType<LieutenantCobaltBossAI>(), "Lt. Cobalt boss missing.");
            Assert.AreEqual(3, Object.FindObjectsByType<MutantCatAI>(FindObjectsSortMode.None).Length, "Expected 3 Mutant Cats.");
            Assert.AreEqual(4, Object.FindObjectsByType<ShipbuilderNPC>(FindObjectsSortMode.None).Length, "Expected 4 Shipbuilder NPCs.");
            Assert.AreEqual(3, Object.FindObjectsByType<ColonyCatNPC>(FindObjectsSortMode.None).Length, "Expected 3 Colony Cat NPCs.");
            Assert.IsNotNull(Object.FindAnyObjectByType<SeagullFlock>(), "SeagullFlock missing.");
            Assert.IsNotNull(Object.FindAnyObjectByType<StylizedWaterSurface>(), "StylizedWaterSurface missing.");
            Assert.IsNotNull(Object.FindAnyObjectByType<PounceTrajectoryVisualizer>(), "PounceTrajectoryVisualizer missing on Alba.");
            Assert.IsNotNull(Object.FindAnyObjectByType<MissionManager>(), "MissionManager missing.");
            Assert.IsNotNull(Object.FindAnyObjectByType<ProgressionSystem>(), "ProgressionSystem missing.");
            Assert.IsNotNull(Object.FindAnyObjectByType<TacticalRadarController>(), "TacticalRadarController missing.");
            Assert.IsNotNull(Object.FindAnyObjectByType<GeigerAudioSynth>(), "GeigerAudioSynth missing.");
            Assert.IsNotNull(Object.FindAnyObjectByType<SpatialAudioWiring>(), "SpatialAudioWiring missing.");
        }

        [Test]
        public void MissionManager_Has4ActsAndCompletesObjectives()
        {
            var go = new GameObject("TestMissionMgr");
            try
            {
                var mgr = go.AddComponent<MissionManager>();
                Assert.GreaterOrEqual(mgr.TotalCount, 8, "Expected >= 8 chapter objectives.");
                var active = mgr.GetActiveObjective();
                Assert.IsNotNull(active);
                mgr.CompleteObjective(active.id);
                Assert.AreEqual(1, mgr.CompletedCount);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void ProgressionSystem_AwardsXpAndMultipliers()
        {
            var go = new GameObject("TestProgSys");
            try
            {
                var prog = go.AddComponent<ProgressionSystem>();
                prog.AddXP(500);
                Assert.GreaterOrEqual(prog.GetSpeedMultiplier(), 1f);
                Assert.GreaterOrEqual(prog.GetDamageMultiplier(), 1f);
                Assert.GreaterOrEqual(prog.GetRadResistanceMultiplier(), 1f);
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }

        [Test]
        public void TacticalRadar_CollectsBlipsWithoutErrors()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var radar = Object.FindAnyObjectByType<TacticalRadarController>();
            Assert.IsNotNull(radar);
            var buffer = new List<RadarBlip>();
            radar.GetRadarBlips(buffer);
            Assert.IsNotNull(buffer);
        }
    }
}
