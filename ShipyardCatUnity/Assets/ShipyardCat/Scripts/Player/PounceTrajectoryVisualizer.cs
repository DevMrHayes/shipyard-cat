using UnityEngine;
using UnityEngine.InputSystem;

namespace ShipyardCat.Player
{
    [RequireComponent(typeof(LineRenderer))]
    public sealed class PounceTrajectoryVisualizer : MonoBehaviour
    {
        private const int PointCount = 24;
        private const float OriginHeightOffset = 0.35f;

        [Header("Trajectory Parameters")]
        [SerializeField] private float _forwardSpeed = 8f;
        [SerializeField] private float _upwardSpeed = 4.5f;
        [SerializeField] private float _timeStep = 0.05f;
        [SerializeField] private float _gravityScale = 1f;

        [Header("References")]
        [SerializeField] private LineRenderer _lineRenderer;

        private readonly Vector3[] _trajectoryPoints = new Vector3[PointCount];
        private bool _isVisualizing;

        private void Awake()
        {
            if (_lineRenderer == null)
            {
                _lineRenderer = GetComponent<LineRenderer>();
            }

            _lineRenderer.useWorldSpace = true;
            _lineRenderer.positionCount = PointCount;
            _lineRenderer.enabled = false;
        }

        private void OnDisable()
        {
            SetVisualizerActive(false);
        }

        private void Update()
        {
            Mouse mouse = Mouse.current;
            bool shouldVisualize = mouse != null && mouse.rightButton.isPressed;

            if (shouldVisualize != _isVisualizing)
            {
                SetVisualizerActive(shouldVisualize);
            }

            if (_isVisualizing)
            {
                UpdateTrajectory();
            }
        }

        private void SetVisualizerActive(bool active)
        {
            _isVisualizing = active;
            if (_lineRenderer != null)
            {
                _lineRenderer.enabled = active;
            }
        }

        private void UpdateTrajectory()
        {
            Vector3 origin = transform.position + Vector3.up * OriginHeightOffset;
            Vector3 initialVelocity = transform.forward * _forwardSpeed + Vector3.up * _upwardSpeed;
            Vector3 gravity = Physics.gravity * _gravityScale;

            for (int i = 0; i < PointCount; i++)
            {
                float t = i * _timeStep;
                _trajectoryPoints[i] = origin + initialVelocity * t + gravity * (0.5f * t * t);
            }

            _lineRenderer.SetPositions(_trajectoryPoints);
        }
    }
}
