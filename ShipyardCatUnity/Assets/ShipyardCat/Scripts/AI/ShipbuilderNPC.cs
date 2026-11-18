using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace ShipyardCat.AI
{
    public class ShipbuilderNPC : MonoBehaviour
    {
        private const float InteractionRadius = 4.5f;
        private const float InteractionRadiusSqr = InteractionRadius * InteractionRadius;
        private const float RotationSpeed = 5f;

        public static event Action<string, string> OnDialogueTriggered;

        [Header("NPC Identity")]
        [SerializeField] private string npcName = "Mo Kelly";
        [SerializeField] private string tradeRole = "Welder";

        [Header("Dialogue")]
        [SerializeField] private string[] dialogueLines;

        [Header("References")]
        [SerializeField] private Transform albaTransform;

        private int currentDialogueIndex;

        public string NpcName => npcName;
        public string TradeRole => tradeRole;

        private void Awake()
        {
            ResolveAlbaTransform();
        }

        private void Update()
        {
            if (albaTransform == null)
            {
                ResolveAlbaTransform();
                if (albaTransform == null)
                {
                    return;
                }
            }

            Vector3 offset = albaTransform.position - transform.position;
            if (offset.sqrMagnitude > InteractionRadiusSqr)
            {
                return;
            }

            FaceTargetGently(offset);

            if (Keyboard.current != null && Keyboard.current.eKey.wasPressedThisFrame)
            {
                TriggerNextDialogueLine();
            }
        }

        private void FaceTargetGently(Vector3 directionToTarget)
        {
            directionToTarget.y = 0f;
            if (directionToTarget.sqrMagnitude <= 0.0001f)
            {
                return;
            }

            Quaternion targetRotation = Quaternion.LookRotation(directionToTarget);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, RotationSpeed * Time.deltaTime);
        }

        private void TriggerNextDialogueLine()
        {
            if (dialogueLines == null || dialogueLines.Length == 0)
            {
                return;
            }

            if (currentDialogueIndex >= dialogueLines.Length)
            {
                currentDialogueIndex = 0;
            }

            string line = dialogueLines[currentDialogueIndex];
            currentDialogueIndex = (currentDialogueIndex + 1) % dialogueLines.Length;

            OnDialogueTriggered?.Invoke(npcName, line);
        }

        private void ResolveAlbaTransform()
        {
            if (albaTransform != null)
            {
                return;
            }

            GameObject albaObject = GameObject.Find("Alba");
            if (albaObject == null)
            {
                albaObject = GameObject.FindWithTag("Player");
            }

            if (albaObject != null)
            {
                albaTransform = albaObject.transform;
            }
        }
    }
}
