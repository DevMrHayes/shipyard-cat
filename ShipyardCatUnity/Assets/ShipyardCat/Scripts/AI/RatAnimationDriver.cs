using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace ShipyardCat.AI
{
    [DisallowMultipleComponent]
    public sealed class RatAnimationDriver : MonoBehaviour
    {
        [Header("Animation Clips")]
        [SerializeField] private AnimationClip idleClip;
        [SerializeField] private AnimationClip runClip;

        [Header("Blending")]
        [SerializeField] private float runSpeedThreshold = 3.5f;
        [SerializeField] private float blendSpeed = 10f;

        private Animator _animator;
        private NavMeshAgent _agent;

        private PlayableGraph _graph;
        private AnimationMixerPlayable _mixer;
        private AnimationClipPlayable _idlePlayable;
        private AnimationClipPlayable _runPlayable;

        private bool _graphInitialized;
        private float _currentRunWeight;

        private void Awake()
        {
            _agent = GetComponent<NavMeshAgent>();
            if (_agent == null)
            {
                _agent = GetComponentInParent<NavMeshAgent>();
            }

            _animator = GetComponentInChildren<Animator>();
            if (_animator == null)
            {
                _animator = gameObject.AddComponent<Animator>();
            }
        }

        private void Start()
        {
            BuildGraphIfReady();
        }

        private void Update()
        {
            if (!_graphInitialized)
            {
                return;
            }

            float speed = _agent != null ? _agent.velocity.magnitude : 0f;
            float threshold = Mathf.Max(0.01f, runSpeedThreshold);
            float targetRunWeight = Mathf.Clamp01(speed / threshold);

            _currentRunWeight = Mathf.MoveTowards(_currentRunWeight, targetRunWeight, blendSpeed * Time.deltaTime);
            float idleWeight = 1f - _currentRunWeight;

            _mixer.SetInputWeight(0, idleWeight);
            _mixer.SetInputWeight(1, _currentRunWeight);
        }

        private void OnDestroy()
        {
            DestroyGraph();
        }

        public void SetClips(AnimationClip idle, AnimationClip run)
        {
            idleClip = idle;
            runClip = run;
            RebuildGraph();
        }

        public void ConfigureClips(AnimationClip idle, AnimationClip run)
        {
            SetClips(idle, run);
        }

        private void BuildGraphIfReady()
        {
            if (_graphInitialized)
            {
                return;
            }

            if (_animator == null)
            {
                _animator = GetComponentInChildren<Animator>();
                if (_animator == null)
                {
                    _animator = gameObject.AddComponent<Animator>();
                }
            }

            if (idleClip == null && runClip == null)
            {
                return;
            }

            _graph = PlayableGraph.Create("RatAnimGraph");
            _graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);

            _mixer = AnimationMixerPlayable.Create(_graph, 2);

            AnimationClip resolvedIdle = idleClip != null ? idleClip : runClip;
            AnimationClip resolvedRun = runClip != null ? runClip : idleClip;

            _idlePlayable = AnimationClipPlayable.Create(_graph, resolvedIdle);
            _idlePlayable.SetApplyFootIK(false);
            _idlePlayable.SetApplyPlayableIK(false);

            _runPlayable = AnimationClipPlayable.Create(_graph, resolvedRun);
            _runPlayable.SetApplyFootIK(false);
            _runPlayable.SetApplyPlayableIK(false);

            _graph.Connect(_idlePlayable, 0, _mixer, 0);
            _graph.Connect(_runPlayable, 0, _mixer, 1);

            _mixer.SetInputWeight(0, 1f - _currentRunWeight);
            _mixer.SetInputWeight(1, _currentRunWeight);

            AnimationPlayableOutput output = AnimationPlayableOutput.Create(_graph, "RatAnimationOutput", _animator);
            output.SetSourcePlayable(_mixer);

            _graph.Play();
            _graphInitialized = true;
        }

        private void RebuildGraph()
        {
            DestroyGraph();
            BuildGraphIfReady();
        }

        private void DestroyGraph()
        {
            if (_graph.IsValid())
            {
                _graph.Destroy();
            }

            _graphInitialized = false;
        }
    }
}
