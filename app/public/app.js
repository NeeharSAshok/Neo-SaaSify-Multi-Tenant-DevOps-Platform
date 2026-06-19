let currentTab = 'dashboard';
let currentTenant = 'alpha';
let lastLogCount = 0;
let simulationInProgress = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  fetchMetrics();
  fetchTasks();
  updateEducationPanel();

  // Poll metrics every 2.5 seconds for real-time dashboard updates
  setInterval(() => {
    if (!simulationInProgress) {
      fetchMetrics();
    }
  }, 2500);
});

// --- Tab Switching Logic ---
function switchTab(tabId) {
  currentTab = tabId;
  
  // Update nav buttons active state
  document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${tabId}`).classList.add('active');

  // Update visible panels
  document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  // Update headers
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');

  if (tabId === 'dashboard') {
    title.textContent = 'CTO DevOps & Observability Portal';
    subtitle.textContent = 'Real-time DORA metrics, SLO performance, and Kubernetes workload status.';
  } else if (tabId === 'app') {
    title.textContent = 'Multi-Tenant Application Board';
    subtitle.textContent = 'Interact with tenant workloads to generate real-time metrics and demonstrate namespace isolation.';
    fetchTasks();
  } else if (tabId === 'architecture') {
    title.textContent = 'Kubernetes Cluster Namespace Topology';
    subtitle.textContent = 'Live visualization of namespaces, replica pods, traffic boundaries, and security rules.';
  }
}

// --- Tenant Workspace Selector ---
function switchTenant(tenant) {
  currentTenant = tenant;
  
  // Active classes
  document.querySelectorAll('.tenant-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.tenant-btn.${tenant}`).classList.add('active');

  document.getElementById('active-tenant-title').textContent = `tenant-${tenant} Workspace`;
  
  // Color code active title
  const titleEl = document.getElementById('active-tenant-title');
  titleEl.className = 'tenant-display';
  if (tenant === 'beta') titleEl.style.color = 'var(--purple)';
  else if (tenant === 'gamma') titleEl.style.color = 'var(--info)';
  else titleEl.style.color = 'var(--primary)';

  fetchTasks();
  updateEducationPanel();
}

// --- Fetch and Render Task List ---
function fetchTasks() {
  const taskList = document.getElementById('task-list');
  taskList.innerHTML = `<li class="task-item"><span class="task-text">Loading isolated workspace...</span></li>`;

  fetch(`/api/tasks?tenant=${currentTenant}`)
    .then(res => res.json())
    .then(tasks => {
      taskList.innerHTML = '';
      if (tasks.length === 0) {
        taskList.innerHTML = `<li class="task-item"><span class="task-text" style="color: var(--text-muted)">No tasks in this workspace namespace. Create one below!</span></li>`;
        return;
      }
      
      tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        li.innerHTML = `
          <div class="task-left">
            <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTask('${task.id}', ${task.completed})">
              ${task.completed ? '<i class="fa-solid fa-check"></i>' : ''}
            </div>
            <span class="task-text">${escapeHTML(task.title)}</span>
          </div>
          <button class="task-delete" onclick="deleteTask('${task.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        `;
        taskList.appendChild(li);
      });
    })
    .catch(err => {
      console.error(err);
      taskList.innerHTML = `<li class="task-item"><span class="task-text" style="color: var(--danger)">Error loading workspace.</span></li>`;
    });
}

// --- Add Task ---
function addTask(e) {
  e.preventDefault();
  const input = document.getElementById('task-input');
  const title = input.value;
  if (!title.trim()) return;

  fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant: currentTenant, title })
  })
    .then(res => res.json())
    .then(() => {
      input.value = '';
      fetchTasks();
      fetchMetrics(); // Refresh latency
    })
    .catch(err => console.error(err));
}

// --- Delete Task ---
function deleteTask(id) {
  fetch(`/api/tasks/${id}?tenant=${currentTenant}`, { method: 'DELETE' })
    .then(() => {
      fetchTasks();
      fetchMetrics();
    })
    .catch(err => console.error(err));
}

// --- Fetch and Update Dashboard Metrics ---
function fetchMetrics() {
  fetch('/api/metrics')
    .then(res => res.json())
    .then(metrics => {
      updateOverviewStats(metrics);
      updateDoraDashboard(metrics.dora);
      updateTenantMetricsTable(metrics.tenants);
      updateK8sTopology(metrics.tenants);
      updateEventLogs(metrics.logs);
    })
    .catch(err => console.error('Error fetching metrics:', err));
}

// 1. Update Overview Stats
function updateOverviewStats(metrics) {
  document.getElementById('stat-slo-uptime').textContent = `${metrics.slo.uptime}%`;
  document.getElementById('stat-security-incidents').textContent = metrics.slo.crossTenantBreaches;
  document.getElementById('stat-noisy-neighbors').textContent = metrics.slo.noisyNeighborIncidents;

  // Calculate total active pods
  let totalPods = 0;
  Object.values(metrics.tenants).forEach(t => {
    totalPods += t.pods;
  });
  document.getElementById('stat-active-pods').textContent = totalPods;
}

// 2. Update DORA Dashboard Metrics
function updateDoraDashboard(dora) {
  document.getElementById('dora-df-val').textContent = `${dora.deploymentFrequency} deploys/day`;
  document.getElementById('dora-lt-val').textContent = `${dora.leadTime} hours`;
  document.getElementById('dora-cfr-val').textContent = `${dora.changeFailureRate}%`;
  document.getElementById('dora-mttr-val').textContent = `${dora.mttr} minutes`;

  // Dynamically update card classes & progress bars
  updateDoraCardStatus('dora-df-card', dora.deploymentFrequency >= 1.0 ? 'healthy' : 'warning');
  updateDoraCardStatus('dora-lt-card', dora.leadTime <= 4.0 ? 'healthy' : 'warning');
  
  const cfrStatus = dora.changeFailureRate <= 15.0 ? 'healthy' : (dora.changeFailureRate <= 25.0 ? 'warning' : 'critical');
  updateDoraCardStatus('dora-cfr-card', cfrStatus);
  
  const mttrStatus = dora.mttr <= 30 ? 'healthy' : 'warning';
  updateDoraCardStatus('dora-mttr-card', mttrStatus);

  // Update progress bar widths
  document.querySelector('#dora-df-card .dora-progress-bar').style.width = `${Math.min(100, dora.deploymentFrequency * 70)}%`;
  document.querySelector('#dora-lt-card .dora-progress-bar').style.width = `${Math.max(10, 100 - (dora.leadTime * 15))}%`;
  
  const cfrBar = document.querySelector('#dora-cfr-card .dora-progress-bar');
  cfrBar.className = `dora-progress-bar ${cfrStatus === 'healthy' ? '' : cfrStatus === 'warning' ? 'warning' : 'danger'}`;
  cfrBar.style.width = `${dora.changeFailureRate}%`;
  
  document.querySelector('#dora-mttr-card .dora-progress-bar').style.width = `${Math.max(10, 100 - (dora.mttr * 2))}%`;
}

function updateDoraCardStatus(cardId, status) {
  const card = document.getElementById(cardId);
  card.className = `dora-card ${status}`;
  card.querySelector('.dora-status-badge').textContent = status;
}

// 3. Update Tenant Table rows
function updateTenantMetricsTable(tenants) {
  const tbody = document.getElementById('tenant-metrics-tbody');
  tbody.innerHTML = '';

  Object.entries(tenants).forEach(([name, data]) => {
    const tr = document.createElement('tr');
    
    // Status column
    const statusText = data.quotaExceeded ? 'Clamped (Quota)' : 'Isolated (Zero-Trust)';
    const statusClass = data.quotaExceeded ? 'compromised' : 'isolated';
    const statusIcon = data.quotaExceeded ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-shield-halved';

    // Resource calculations
    const cpuFill = Math.min(100, data.cpu);
    const cpuClass = cpuFill > 90 ? 'danger' : cpuFill > 70 ? 'warning' : '';
    const memFill = Math.min(100, data.memory);
    const memClass = memFill > 90 ? 'danger' : memFill > 70 ? 'warning' : '';

    // SLA health
    const slaStatus = data.latency < 200 ? 'Healthy' : 'SLA Violate';
    const slaClass = data.latency < 200 ? 'status-indicator' : 'status-indicator danger';

    tr.innerHTML = `
      <td>
        <div class="tenant-cell">
          <strong>tenant-${name}</strong>
          <span>namespace: tenant-${name}</span>
        </div>
      </td>
      <td>
        <span class="ns-status ${statusClass}">
          <i class="${statusIcon}"></i> ${statusText}
        </span>
      </td>
      <td>
        <div class="resource-bar-wrapper">
          <div class="resource-label">
            <span>Usage</span>
            <span>${data.cpu}%</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill ${cpuClass}" style="width: ${cpuFill}%;"></div>
          </div>
        </div>
      </td>
      <td>
        <div class="resource-bar-wrapper">
          <div class="resource-label">
            <span>Usage</span>
            <span>${data.memory}%</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill ${memClass}" style="width: ${memFill}%;"></div>
          </div>
        </div>
      </td>
      <td><strong style="font-family: 'JetBrains Mono', monospace; font-size: 14px;">${data.pods}</strong></td>
      <td><strong style="color: ${data.latency >= 200 ? 'var(--danger)' : 'var(--text-primary)'}">${data.latency} ms</strong></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="${slaClass}"></span>
          <span style="font-weight: 500">${slaStatus}</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. Synchronize Kubernetes Topology visual map
function updateK8sTopology(tenants) {
  // Update active replica pods per namespace
  Object.entries(tenants).forEach(([name, data]) => {
    const podContainer = document.getElementById(`k8s-pods-${name}`);
    podContainer.innerHTML = '';
    
    for (let i = 1; i <= data.pods; i++) {
      const pod = document.createElement('div');
      pod.className = 'pod-replica';
      pod.innerHTML = `<i class="fa-solid fa-cube"></i> task-manager-pod-${i}`;
      podContainer.appendChild(pod);
    }

    // Toggle border blinking or quota alert animations
    const nsBox = document.getElementById(`node-ns-${name}`);
    if (data.quotaExceeded) {
      nsBox.style.borderColor = 'var(--warning)';
      nsBox.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.15)';
    } else {
      nsBox.style.borderColor = 'var(--border-color)';
      nsBox.style.boxShadow = 'none';
    }
  });
}

// 5. Update Log Streams
function updateEventLogs(logs) {
  const terminal = document.getElementById('log-terminal');
  if (logs.length === lastLogCount) return;

  // Append new logs only
  const newLogs = logs.slice(lastLogCount);
  newLogs.forEach(log => {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
      <span class="log-time">[${log.timestamp}]</span>
      <span class="log-tag ${log.type}">${log.type}</span>
      <span class="log-message">${escapeHTML(log.message)}</span>
    `;
    terminal.appendChild(line);
  });

  lastLogCount = logs.length;
  
  // Auto-scroll terminal
  terminal.scrollTop = terminal.scrollHeight;
}

function clearLogs() {
  document.getElementById('log-terminal').innerHTML = '';
  lastLogCount = 0;
  // Clear on backend
  fetch('/api/metrics')
    .then(res => res.json())
    .then(metrics => {
      metrics.logs = [];
    });
}

// --- Simulation Trigger Actions ---
function triggerSimulation(type) {
  if (simulationInProgress) return;
  simulationInProgress = true;

  // Disable button actions to prevent concurrency issues
  document.querySelectorAll('.sim-btn').forEach(btn => btn.classList.add('disabled'));

  const logTerm = document.getElementById('log-terminal');
  const timestamp = new Date().toLocaleTimeString();

  if (type === 'deploy') {
    // Sync UI badge
    const badge = document.getElementById('gitops-status-badge');
    badge.className = 'gitops-status syncing';
    badge.querySelector('span').textContent = 'GitOps Syncing...';

    fetch('/api/simulate/deploy', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        // Run log polling during the mock deploy sequence
        let interval = setInterval(fetchMetrics, 1000);
        
        setTimeout(() => {
          clearInterval(interval);
          badge.className = 'gitops-status synced';
          badge.querySelector('span').textContent = 'GitOps Synced';
          simulationInProgress = false;
          document.querySelectorAll('.sim-btn').forEach(btn => btn.classList.remove('disabled'));
          fetchMetrics();
        }, 5000);
      });

  } else if (type === 'traffic') {
    // Traffic Spike
    fetch('/api/simulate/traffic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant: 'alpha', type: 'spike' })
    }).then(() => {
      // Poll to show spike
      fetchMetrics();
      
      // Keep spike for 6 seconds, then reset
      setTimeout(() => {
        fetch('/api/simulate/traffic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant: 'alpha', type: 'normal' })
        }).then(() => {
          simulationInProgress = false;
          document.querySelectorAll('.sim-btn').forEach(btn => btn.classList.remove('disabled'));
          fetchMetrics();
        });
      }, 7000);
    });

  } else if (type === 'noisy') {
    // Noisy Neighbor heavy load
    fetch('/api/simulate/traffic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant: 'alpha', type: 'heavy' })
    }).then(() => {
      fetchMetrics();
      
      // Let it run for 6 seconds, then reset
      setTimeout(() => {
        fetch('/api/simulate/traffic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant: 'alpha', type: 'normal' })
        }).then(() => {
          simulationInProgress = false;
          document.querySelectorAll('.sim-btn').forEach(btn => btn.classList.remove('disabled'));
          fetchMetrics();
        });
      }, 7000);
    });

  } else if (type === 'security') {
    // Cross-tenant connection mock attack
    fetch('/api/simulate/network-attack', { method: 'POST' })
      .then(() => {
        // Toggle topology visual attack warning
        const betaNode = document.getElementById('node-ns-beta');
        const alphaNode = document.getElementById('node-ns-alpha');
        
        betaNode.classList.add('attacked');
        alphaNode.classList.add('attacked');

        let interval = setInterval(fetchMetrics, 500);

        setTimeout(() => {
          clearInterval(interval);
          betaNode.classList.remove('attacked');
          alphaNode.classList.remove('attacked');
          simulationInProgress = false;
          document.querySelectorAll('.sim-btn').forEach(btn => btn.classList.remove('disabled'));
          fetchMetrics();
        }, 3500);
      });

  } else if (type === 'outage') {
    // Node failure outage simulation
    fetch('/api/simulate/outage', { method: 'POST' })
      .then(() => {
        let interval = setInterval(fetchMetrics, 1000);

        setTimeout(() => {
          clearInterval(interval);
          simulationInProgress = false;
          document.querySelectorAll('.sim-btn').forEach(btn => btn.classList.remove('disabled'));
          fetchMetrics();
        }, 10000);
      });
  }
}

// --- Dynamic Educational Content Generator ---
function updateEducationPanel() {
  const panel = document.getElementById('tenant-policy-info');
  
  if (currentTenant === 'alpha') {
    panel.innerHTML = `
      <h3>Isolated Namespace Profile: <code>tenant-alpha</code></h3>
      <p>This is a production workspace configured with maximum availability protections.</p>
      
      <h3>Active Policies Defined in Repo:</h3>
      <ul>
        <li>
          <strong>Workspace Namespace</strong>: Restricts tasks and databases to this namespace boundary.
          <br><span class="file-tag">k8s/tenant-namespaces.yaml</span>
        </li>
        <li>
          <strong>LimitRanges & ResourceQuotas</strong>: Restricts pods to default 500m CPU and 512Mi Memory requests. Enforces hard limits preventing CPU starvation of other tenants.
          <br><span class="file-tag">k8s/resource-quotas.yaml</span>
          <br><span class="file-tag">k8s/limit-ranges.yaml</span>
        </li>
        <li>
          <strong>NetworkPolicy (Zero-Trust)</strong>: Denies incoming packets from outside namespaces, including tenant-beta and tenant-gamma. Allows ingress from nginx router.
          <br><span class="file-tag">k8s/network-policies.yaml</span>
        </li>
        <li>
          <strong>HashiCorp Vault Secret Injection</strong>: Secure database connection variables injected at startup via sidecar annotation. No raw environment variables stored.
          <br><span class="file-tag">k8s/rbac-vault-secrets.yaml</span>
        </li>
        <li>
          <strong>Autoscaling & Recovery (HPA & PDB)</strong>: Minimum replicas set to 2. PodDisruptionBudget ensures at least 1 pod is active during node eviction cycles.
          <br><span class="file-tag">k8s/hpa-pdb.yaml</span>
        </li>
      </ul>
    `;
  } else if (currentTenant === 'beta') {
    panel.innerHTML = `
      <h3>Isolated Namespace Profile: <code>tenant-beta</code></h3>
      <p>This is a production workspace utilizing Spot Instance Node Pools to minimize infrastructure costs.</p>
      
      <h3>Active Policies Defined in Repo:</h3>
      <ul>
        <li>
          <strong>Spot Taints & Tolerations</strong>: Configured in the Terraform Node Group to schedule tenant workloads on cheap Spot instances, automatically managed by AWS Auto Scaling.
          <br><span class="file-tag">terraform/main.tf</span>
        </li>
        <li>
          <strong>Zero-Trust Isolation</strong>: Strictly isolates tenant data and restricts database connections to local namespace services.
          <br><span class="file-tag">k8s/network-policies.yaml</span>
        </li>
        <li>
          <strong>Role-Based Access Control (RBAC)</strong>: Restricts permissions for developers mapping to this tenant, preventing visibility or configuration access to tenant-alpha namespace.
          <br><span class="file-tag">k8s/rbac-vault-secrets.yaml</span>
        </li>
      </ul>
    `;
  } else if (currentTenant === 'gamma') {
    panel.innerHTML = `
      <h3>Isolated Namespace Profile: <code>tenant-gamma</code></h3>
      <p>This is a staging environment configured with minimal resource profiles (low quotas) to conserve costs.</p>
      
      <h3>Active Policies Defined in Repo:</h3>
      <ul>
        <li>
          <strong>Clamped Resource Quotas</strong>: Hard-clamped to a maximum of 1 CPU and 1Gi Memory request. Pods are restricted to smaller default size boundaries.
          <br><span class="file-tag">k8s/resource-quotas.yaml</span>
          <br><span class="file-tag">k8s/limit-ranges.yaml</span>
        </li>
        <li>
          <strong>Single Instance replica</strong>: Min replicas set to 1. No active PodDisruptionBudget (PDB) applied, allowing developers to inspect nodes and simulate staging shutdowns safely.
          <br><span class="file-tag">k8s/hpa-pdb.yaml</span>
        </li>
      </ul>
    `;
  }
}

// --- Helpers ---
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
