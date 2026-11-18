using UnityEngine;
using UnityEngine.InputSystem;

namespace ShipyardCat.Player
{
    /// <summary>
    /// Third-person spring-arm camera rig for Alba with collision pullback.
    /// </summary>
    public class AlbaCameraRig : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private float distance = 4.2f;
        [SerializeField] private float minDistance = 1.2f;
        [SerializeField] private float heightOffset = 0.85f;
        [SerializeField] private float yawSpeed = 120f;
        [SerializeField] private float pitchSpeed = 80f;
        [SerializeField] private float followSmooth = 12f;
        [SerializeField] private LayerMask collisionMask = ~0;

        private float _yaw = 0f;
        private float _pitch = 18f;
        private float _currentDist;

        private void Awake()
        {
            _currentDist = distance;
        }

        public void SetTarget(Transform newTarget)
        {
            target = newTarget;
            if (target != null)
            {
                _yaw = target.eulerAngles.y;
                SnapToTarget();
            }
        }

        public void SnapToTarget()
        {
            if (target == null) return;
            Vector3 pivot = target.position + Vector3.up * heightOffset;
            Quaternion rot = Quaternion.Euler(_pitch, _yaw, 0f);
            transform.position = pivot - (rot * Vector3.forward) * distance;
            transform.LookAt(pivot);
        }

        private void LateUpdate()
        {
            if (target == null) return;

            var kb = Keyboard.current;
            var mouse = Mouse.current;

            if (mouse != null && mouse.rightButton.isPressed)
            {
                Vector2 delta = mouse.delta.ReadValue();
                _yaw += delta.x * 0.18f;
                _pitch = Mathf.Clamp(_pitch - delta.y * 0.14f, -10f, 65f);
            }
            if (kb != null)
            {
                if (kb.leftArrowKey.isPressed) _yaw -= yawSpeed * Time.deltaTime;
                if (kb.rightArrowKey.isPressed) _yaw += yawSpeed * Time.deltaTime;
                if (kb.upArrowKey.isPressed) _pitch = Mathf.Clamp(_pitch + pitchSpeed * Time.deltaTime, -10f, 65f);
                if (kb.downArrowKey.isPressed) _pitch = Mathf.Clamp(_pitch - pitchSpeed * Time.deltaTime, -10f, 65f);
            }

            Vector3 pivot = target.position + Vector3.up * heightOffset;
            Quaternion rot = Quaternion.Euler(_pitch, _yaw, 0f);
            Vector3 backDir = -(rot * Vector3.forward);

            float targetDist = distance;
            if (Physics.Raycast(pivot, backDir, out RaycastHit hit, distance, collisionMask, QueryTriggerInteraction.Ignore))
            {
                if (!hit.transform.IsChildOf(target))
                {
                    targetDist = Mathf.Clamp(hit.distance - 0.25f, minDistance, distance);
                }
            }

            _currentDist = Mathf.Lerp(_currentDist, targetDist, Time.deltaTime * followSmooth);
            Vector3 desiredPos = pivot + backDir * _currentDist;
            transform.position = Vector3.Lerp(transform.position, desiredPos, Time.deltaTime * followSmooth);
            transform.LookAt(pivot);
        }
    }
}
