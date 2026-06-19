const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- In-Memory Databases ---
const tenantTasks = {
  alpha: [
    { id: '1', title: 'Prepare Q3 roadmap', completed: false, createdAt: new Date() },
    { id: '2', title: 'Review security compliance', completed: true, createdAt: new Date() }
  ],
  beta: [
    { id: '1', title: 'Onboard engineering team', completed: false, createdAt: new Date() }
  ],
  gamma: [
    { id: '1', title: 'Staging environment dry-run', completed: false, createdAt: new Date() }
  ]
};

// Baselines for DevOps and Observability Metrics
let devopsMetrics = {
  // DORA Metrics
  dora: {
    deploymentFrequency: 1.2, // deploys/day
    leadTime: 3.8,            // hours
    changeFailureRate: 11.5,  // %
    mttr: 28                  // minutes
  },
  // Observability & SLOs
  slo: {
    uptime: 99.96,           // %
    crossTenantBreaches: 0,
    noisyNeighborIncidents: 0
  },
  // Per-tenant metrics
  tenants: {
    alpha: {
      cpu: 18,               // % of quota
      memory: 22,            // % of quota
      pods: 2,               // HPA replica count
      latency: 110,          // ms
      requestCount: 1450,
      quotaExceeded: false
    },
    beta: {
      cpu: 12,
      memory: 15,
      pods: 2,
      latency: 85,
      requestCount: 820,
      quotaExceeded: false
    },
    gamma: {
      cpu: 5,
      memory: 8,
      pods: 1,
      latency: 95,
      requestCount: 110,
      quotaExceeded: false
    }
  },
  // System Logs & Events
  logs: [
    { timestamp: new Date().toLocaleTimeString(), type: 'system', message: 'Kubernetes cluster initialized with 3 namespaces: tenant-alpha, tenant-beta, tenant-gamma' },
    { timestamp: new Date().toLocaleTimeString(), type: 'gitops', message: 'ArgoCD synchronized application version v1.2.4 successfully.' },
    { timestamp: new Date().toLocaleTimeString(), type: 'security', message: 'Trivy Scan: 0 vulnerabilities found in ghcr.io/saasify-app:latest' }
  ]
};

// --- Task management APIs ---
app.get('/api/tasks', (req, res) => {
  const tenant = req.query.tenant;
  if (!tenant || !tenantTasks[tenant]) {
    return res.status(400).json({ error: 'Valid tenant query parameter is required (alpha, beta, gamma)' });
  }
  res.json(tenantTasks[tenant]);
});

app.post('/api/tasks', (req, res) => {
  const { tenant, title } = req.body;
  if (!tenant || !tenantTasks[tenant]) {
    return res.status(400).json({ error: 'Valid tenant is required (alpha, beta, gamma)' });
  }
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Task title is required' });
  }

  const newTask = {
    id: Date.now().toString(),
    title: title.trim(),
    completed: false,
    createdAt: new Date()
  };

  tenantTasks[tenant].push(newTask);
  
  // Track latency of the write operation
  const latency = Math.floor(Math.random() * 50) + 120; // 120-170ms
  devopsMetrics.tenants[tenant].latency = latency;
  devopsMetrics.tenants[tenant].requestCount += 1;

  res.status(201).json(newTask);
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const tenant = req.query.tenant;

  if (!tenant || !tenantTasks[tenant]) {
    return res.status(400).json({ error: 'Valid tenant query parameter is required' });
  }

  const taskIndex = tenantTasks[tenant].findIndex(t => t.id === id);
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  tenantTasks[tenant].splice(taskIndex, 1);
  devopsMetrics.tenants[tenant].requestCount += 1;

  res.json({ success: true });
});

// --- DevOps Simulation & Observability APIs ---
app.get('/api/metrics', (req, res) => {
  res.json(devopsMetrics);
});

// 1. Simulate Traffic Spike
app.post('/api/simulate/traffic', (req, res) => {
  const { tenant, type } = req.body; // type: 'normal' or 'spike' or 'heavy'
  
  if (!tenant || !devopsMetrics.tenants[tenant]) {
    return res.status(400).json({ error: 'Invalid tenant' });
  }

  const targetTenant = devopsMetrics.tenants[tenant];
  const timestamp = new Date().toLocaleTimeString();

  if (type === 'spike') {
    // Pod autoscaler and resource usage spike
    targetTenant.cpu = 88; // Exceeds target utilization (70%)
    targetTenant.memory = 76;
    targetTenant.latency = 240; // Exceeds SLO of < 200ms
    targetTenant.requestCount += 850;

    devopsMetrics.logs.push({
      timestamp,
      type: 'observability',
      message: `ALERT: Traffic spike detected on namespace "tenant-${tenant}". CPU utilization at 88%.`
    });

    // Simulate HPA Scaling out pods
    setTimeout(() => {
      targetTenant.pods = 6;
      targetTenant.cpu = 32; // Drop CPU per pod now that replicas scaled
      targetTenant.latency = 145; // Back down under SLO
      devopsMetrics.logs.push({
        timestamp: new Date().toLocaleTimeString(),
        type: 'k8s',
        message: `K8s-HPA: Scaled deployment "task-manager" in namespace "tenant-${tenant}" from 2 to 6 replicas.`
      });
    }, 3000);

  } else if (type === 'heavy') {
    // "Noisy neighbor" workload: tries to consume resources beyond limits
    targetTenant.cpu = 110; 
    targetTenant.memory = 105;
    targetTenant.latency = 480; 
    targetTenant.requestCount += 1200;

    devopsMetrics.logs.push({
      timestamp,
      type: 'observability',
      message: `WARNING: High workload execution in namespace "tenant-${tenant}". Triggering Kubernetes LimitRanges.`
    });

    // ResourceQuota clamping demonstration
    setTimeout(() => {
      targetTenant.cpu = 95; // Clamped by ResourceQuota limits (max 4 CPUs hard limit)
      targetTenant.memory = 90;
      targetTenant.quotaExceeded = true;
      devopsMetrics.logs.push({
        timestamp: new Date().toLocaleTimeString(),
        type: 'k8s',
        message: `K8s-ResourceQuota: Clamped resources in "tenant-${tenant}" namespace. Prevented resource leakage to other namespaces.`
      });
    }, 2500);

  } else {
    // Reset to normal
    targetTenant.cpu = tenant === 'alpha' ? 18 : tenant === 'beta' ? 12 : 5;
    targetTenant.memory = tenant === 'alpha' ? 22 : tenant === 'beta' ? 15 : 8;
    targetTenant.pods = tenant === 'gamma' ? 1 : 2;
    targetTenant.latency = tenant === 'alpha' ? 110 : tenant === 'beta' ? 85 : 95;
    targetTenant.quotaExceeded = false;

    devopsMetrics.logs.push({
      timestamp,
      type: 'system',
      message: `Namespace "tenant-${tenant}" returned to baseline workload.`
    });
  }

  res.json({ success: true, metrics: devopsMetrics });
});

// 2. Simulate GitOps Deployment Pipeline
app.post('/api/simulate/deploy', (req, res) => {
  const timestamp = new Date().toLocaleTimeString();
  const buildSuccess = Math.random() > 0.15; // 85% success rate to mirror CFR targets

  devopsMetrics.logs.push({
    timestamp,
    type: 'gitops',
    message: 'GitOps: Code commit detected on main. Triggering GitHub Actions CI/CD workflow...'
  });

  const stepsLogs = [
    { delay: 1000, type: 'gitops', msg: 'CI: Linting codebase and running Jest test suites... PASS' },
    { delay: 2000, type: 'security', msg: 'Trivy Scan: Container base scanned. 0 Critical, 0 High vulnerabilities found.' },
    { delay: 3000, type: 'gitops', msg: 'Docker: Built container image ghcr.io/saasify-app:v1.3.0 and pushed to registry.' }
  ];

  stepsLogs.forEach(step => {
    setTimeout(() => {
      devopsMetrics.logs.push({
        timestamp: new Date().toLocaleTimeString(),
        type: step.type,
        message: step.msg
      });
    }, step.delay);
  });

  setTimeout(() => {
    const endTimestamp = new Date().toLocaleTimeString();
    if (buildSuccess) {
      // Improve DORA metrics
      devopsMetrics.dora.deploymentFrequency = parseFloat((devopsMetrics.dora.deploymentFrequency + 0.1).toFixed(2));
      devopsMetrics.dora.leadTime = parseFloat(Math.max(1.5, devopsMetrics.dora.leadTime - 0.2).toFixed(2));
      devopsMetrics.dora.changeFailureRate = parseFloat(Math.max(5.0, devopsMetrics.dora.changeFailureRate - 0.3).toFixed(2));
      
      devopsMetrics.logs.push({
        timestamp: endTimestamp,
        type: 'gitops',
        message: 'ArgoCD Sync: Syncing cluster manifests to release tag v1.3.0. Deployment successfully rolled out.'
      });
    } else {
      // Simulate build failure
      devopsMetrics.dora.changeFailureRate = parseFloat((devopsMetrics.dora.changeFailureRate + 1.5).toFixed(2));
      devopsMetrics.logs.push({
        timestamp: endTimestamp,
        type: 'gitops',
        message: 'DEPLOYMENT FAILED: Health checks failed on canary rollout. Rollback to version v1.2.4 initiated.'
      });
    }
  }, 4000);

  res.json({ success: true, buildSuccess });
});

// 3. Simulate Zero-Trust Network Policy Breach Attempt
app.post('/api/simulate/network-attack', (req, res) => {
  const timestamp = new Date().toLocaleTimeString();
  
  devopsMetrics.logs.push({
    timestamp,
    type: 'security',
    message: 'SECURITY RUN: Initiating cross-tenant connection attempt: tenant-beta-pod -> tenant-alpha-db-service.'
  });

  // Zero trust policy demonstration
  setTimeout(() => {
    devopsMetrics.logs.push({
      timestamp: new Date().toLocaleTimeString(),
      type: 'security',
      message: 'BLOCKED: Connection rejected. Kubernetes NetworkPolicy "deny-cross-tenant-traffic" actively dropped traffic packet from source namespace "tenant-beta".'
    });
  }, 1500);

  res.json({ success: true });
});

// 4. Simulate Node Outage & PodDisruptionBudget Protection
app.post('/api/simulate/outage', (req, res) => {
  const timestamp = new Date().toLocaleTimeString();
  
  devopsMetrics.logs.push({
    timestamp,
    type: 'k8s',
    message: 'WARNING: Node "ip-10-0-2-45" went unresponsive. Active failover triggered.'
  });

  // Disrupting replica pods
  devopsMetrics.tenants.alpha.pods = 1; // Dropped to minimum available pods allowed by PDB (minAvailable: 1)
  devopsMetrics.logs.push({
    timestamp: new Date().toLocaleTimeString(),
    type: 'k8s',
    message: 'K8s-PDB: PodDisruptionBudget "tenant-app-pdb" prevented evictions of the last replica pod. Zero downtime maintained.'
  });

  // Simulate recovery process and MTTR calculation
  let secondsToRecover = 8;
  const interval = setInterval(() => {
    secondsToRecover -= 1;
    if (secondsToRecover <= 0) {
      clearInterval(interval);
      devopsMetrics.tenants.alpha.pods = 2; // Scaled back to baseline
      devopsMetrics.dora.mttr = Math.max(10, devopsMetrics.dora.mttr - 2); // MTTR improvements
      devopsMetrics.logs.push({
        timestamp: new Date().toLocaleTimeString(),
        type: 'system',
        message: 'FAILOVER SUCCESSFUL: Replica pod rescheduled on node "ip-10-0-2-120". System fully healthy.'
      });
    }
  }, 1000);

  res.json({ success: true });
});

// --- Server Startup ---
app.listen(PORT, () => {
  console.log(`SaaSify task manager application running at http://localhost:${PORT}`);
});
