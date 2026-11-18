using System;
using UnityEngine;
using UnityEngine.InputSystem;
using ShipyardCat.Player;

namespace ShipyardCat.AI
{
    /// <summary>
    /// Represents a friendly Cat Motel Sanctuary NPC (e.g., Calico Belle, Tripod Toby, Barnaby)
    /// that gently heals Alba when nearby and cycles dialogue on [E] interaction.
    /// </summary>
    public class ColonyCatNPC : MonoBehaviour
    {
        public static event Action<string, string> OnColonyDialogue;

        [SerializeField] private string catName = "Calico Belle";
        [SerializeField] private string[] dialogueLines;
        [SerializeField] private float healRadius = 5f;

        private const float HealRatePerSecond = 2.5f;
        private const float PlayerSearchInterval = 0.5f;

        private Transform _albaTransform;
        private float _nextSearchTime;
        private int _dialogueIndex;

        private void Update()
        {
            if (!IsAlbaNearby())
            {
                return;
            }

            var vitals = _albaTransform != null ? _albaTransform.GetComponent<CatVitals>() : null;
            if (vitals != null)
            {
                vitals.ModifyHealth(HealRatePerSecond * Time.deltaTime);
            }

            if (Keyboard.current != null && Keyboard.current.eKey.wasPressedThisFrame)
            {
                EmitNextDialogue();
            }
        }

        private bool IsAlbaNearby()
        {
            Transform alba = GetAlbaTransform();
            if (alba == null)
            {
                return false;
            }

            float sqrDistance = (alba.position - transform.position).sqrMagnitude;
            return sqrDistance <= healRadius * healRadius;
        }

        private Transform GetAlbaTransform()
        {
            if (_albaTransform != null)
            {
                return _albaTransform;
            }

            if (Time.time < _nextSearchTime)
            {
                return null;
            }

            _nextSearchTime = Time.time + PlayerSearchInterval;

            GameObject player = GameObject.FindGameObjectWithTag("Player");
            if (player == null)
            {
                player = GameObject.Find("Alba");
            }

            if (player != null)
            {
                _albaTransform = player.transform;
            }

            return _albaTransform;
        }

        private void EmitNextDialogue()
        {
            if (dialogueLines == null || dialogueLines.Length == 0)
            {
                return;
            }

            string line = dialogueLines[_dialogueIndex];
            _dialogueIndex = (_dialogueIndex + 1) % dialogueLines.Length;
            OnColonyDialogue?.Invoke(catName, line);
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = new Color(0.4f, 0.9f, 0.6f, 0.75f);
            Gizmos.DrawWireSphere(transform.position, healRadius);
        }
    }
}
