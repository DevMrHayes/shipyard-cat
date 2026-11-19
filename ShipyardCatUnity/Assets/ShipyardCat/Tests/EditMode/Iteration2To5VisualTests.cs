using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using ShipyardCat.AI;
using ShipyardCat.Player;

namespace ShipyardCat.Tests
{
    public class Iteration2To5VisualTests
    {
        [Test]
        public void Alba_HasTuxedoVisualRigCollarTagAndDosimeter()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var alba = Object.FindAnyObjectByType<AlbaController>();
            Assert.IsNotNull(alba, "AlbaController missing.");
            var rig = alba.GetComponent<AlbaVisualRig>();
            Assert.IsNotNull(rig, "AlbaVisualRig missing on Alba_Player.");
            Assert.IsNotNull(alba.transform.Find("Alba_SafetyCollar"), "Orange safety collar missing.");
            Assert.IsNotNull(alba.transform.Find("Alba_BrassNnsTag"), "Brass NNS Sanctuary tag missing.");
            Assert.IsNotNull(alba.transform.Find("Alba_LcdDosimeter"), "LCD Dosimeter missing.");
        }

        [Test]
        public void Environment_HasTwilightSkyboxWetPuddlesAndHeroLandmarks()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            Assert.IsNotNull(RenderSettings.skybox, "Twilight panoramic skybox must be assigned.");
            Assert.IsNotNull(GameObject.Find("DD1_ElevatedCatwalk"), "DD1 Elevated Catwalk missing.");
            Assert.IsNotNull(GameObject.Find("BigBlue_Sign_South"), "Big Blue Newport News sign missing.");
            Assert.IsNotNull(GameObject.Find("Rail_Flatcar"), "Crawlable shipyard rail flatcar missing.");
        }

        [Test]
        public void KingpinBoss_UsesGlbRatModelAndArenaRig()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);
            var kingpin = Object.FindAnyObjectByType<KingpinBossAI>();
            Assert.IsNotNull(kingpin, "KingpinBossAI missing.");
            Assert.IsNotNull(kingpin.GetComponent<KingpinArenaRig>(), "KingpinArenaRig missing.");
            Assert.IsNotNull(kingpin.transform.Find("Kingpin_ScaleWrapper/Rat_GLB_Model"), "Kingpin should use Rat_GLB_Model instead of bare capsule.");
            Assert.IsNull(kingpin.GetComponent<MeshFilter>(), "Kingpin root should not render a bare Capsule MeshFilter.");
        }
    }
}
