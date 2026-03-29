export const BASELINES = {
  smoke: {
    httpReqDurationP95Ms: 600,
    httpReqDurationP99Ms: 1200,
    httpReqFailedRate: 0.01,
    checksRate: 0.99,
  },
  ramp: {
    httpReqDurationP95Ms: 800,
    httpReqDurationP99Ms: 1500,
    httpReqFailedRate: 0.02,
    checksRate: 0.98,
  },
  spike: {
    httpReqDurationP95Ms: 1200,
    httpReqDurationP99Ms: 2500,
    httpReqFailedRate: 0.03,
    checksRate: 0.97,
  },
  endurance: {
    httpReqDurationP95Ms: 900,
    httpReqDurationP99Ms: 1800,
    httpReqFailedRate: 0.02,
    checksRate: 0.98,
  },
};

export function getBaseline(profile) {
  return BASELINES[profile] || BASELINES.smoke;
}
