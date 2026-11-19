using UnityEngine;

namespace ShipyardCat.World
{
    /// <summary>
    /// Orients lamppost additive halo quads toward the active camera cleanly with zero allocations.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class LamppostBillboardHalo : MonoBehaviour
    {
        private Transform _cameraTransform;

        private void LateUpdate()
        {
            if (_cameraTransform == null)
            {
                Camera cam = Camera.main;
                if (cam != null)
                {
                    _cameraTransform = cam.transform;
                }
            }

            if (_cameraTransform == null)
            {
                return;
            }

            Vector3 toCam = _cameraTransform.position - transform.position;
            if (toCam.sqrMagnitude > 0.01f)
            {
                // Quad visible front is local -Z, so point +Z toward viewer's opposite / -Z toward camera
                transform.rotation = Quaternion.LookRotation(-toCam.normalized, Vector3.up);
            }
        }
    }
}
