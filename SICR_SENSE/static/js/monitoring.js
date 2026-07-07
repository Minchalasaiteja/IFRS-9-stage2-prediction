// SICRSense Monitoring Dashboard JavaScript
class MonitoringDashboard {
    constructor() {
        this.ws = null;
        this.charts = {};
        this.currentSection = 'overview';
        this.autoRefreshInterval = null;
        this.reconnectAttempts = 0;
        this.metricsHistory = {
            predictions: [],
            latencies: [],
            connections: []
        };
        this.isInitialized = false;
        this.init();
    }
    
    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        
        this.setupWebSocket();
        this.setupNavigation();
        this.initializeCharts();
        this.fetchInitialData();
        this.startAutoRefresh();
        this.setupEventListeners();
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.fetchInitialData();
            }
        });
    }
    
    setupWebSocket() {
        if (window.wsStatus) {
            window.addEventListener('ws-status-changed', (e) => {
                const connected = e.detail?.connected;
                this.updateConnectionStatus(connected);
                if (connected) {
                    try {
                        window.wsStatus.sendMessage({ type: 'subscribe_metrics' });
                        window.wsStatus.sendMessage({ type: 'subscribe_predictions' });
                        window.wsStatus.sendMessage({ type: 'request_metrics' });
                    } catch (err) {
                        console.warn('Failed to send subscription messages:', err);
                    }
                }
            });

            window.addEventListener('ws-message', (ev) => {
                const data = ev.detail;
                if (!data) return;
                if (data.type === 'error') return;
                this.handleMessage(data);
            });

            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            console.log('Monitoring WebSocket connected');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            this.ws.send(JSON.stringify({ type: 'subscribe_metrics' }));
            this.ws.send(JSON.stringify({ type: 'subscribe_predictions' }));
            this.ws.send(JSON.stringify({ type: 'request_metrics' }));
        };
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'error') return;
                this.handleMessage(data);
            } catch (e) { console.error('Failed to parse WS message:', e); }
        };
        this.ws.onclose = () => { this.updateConnectionStatus(false); const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000); this.reconnectAttempts++; setTimeout(() => this.setupWebSocket(), delay); };
        this.ws.onerror = (error) => { console.error('WebSocket error:', error); this.ws.close(); };
    }
                }
            });

            // Handle incoming messages dispatched globally
            window.addEventListener('ws-message', (ev) => {
                const data = ev.detail;
                if (!data) return;
                if (data.type === 'error') {
                    console.error('WebSocket error:', data.message);
                    return;
                }
                this.handleMessage(data);
            });

            return;
        }

        // Fallback to local WS if centralized manager isn't available
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            console.log('Monitoring WebSocket connected');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            this.ws.send(JSON.stringify({ type: 'subscribe_metrics' }));
            this.ws.send(JSON.stringify({ type: 'subscribe_predictions' }));
            this.ws.send(JSON.stringify({ type: 'request_metrics' }));
        };
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'error') return;
                this.handleMessage(data);
            } catch (e) { console.error('Failed to parse WS message:', e); }
        };
        this.ws.onclose = () => { this.updateConnectionStatus(false); const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000); this.reconnectAttempts++; setTimeout(() => this.setupWebSocket(), delay); };
        this.ws.onerror = (error) => { console.error('WebSocket error:', error); this.ws.close(); };
    }
    
    handleMessage(data) {
        switch(data.type) {
            case 'metrics_update':
                this.updateAllMetrics(data.data);
                break;
            case 'metrics_snapshot':
                this.updateAllMetrics(data.data);
                break;
            case 'system_alert':
                this.showAlert(data);
                break;
            case 'prediction_update':
                this.addLivePrediction(data.data);
                break;
            case 'connection_established':
                console.log('WebSocket connection established:', data.message);
                break;
            case 'subscription_confirmed':
                console.log('Subscription confirmed:', data.channel);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    }
    
    setupNavigation() {
        document.querySelectorAll('[data-section]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                if (section) {
                    this.switchSection(section);
                }
            });
        });
    }
    
    switchSection(section) {
        // Hide all sections
        document.querySelectorAll('[id^="section-"]').forEach(s => {
            s.classList.add('hidden');
        });
        
        // Show selected section
        const target = document.getElementById(`section-${section}`);
        if (target) {
            target.classList.remove('hidden');
            
            // Animate section entrance
            if (typeof gsap !== 'undefined') {
                gsap.from(target.children, {
                    opacity: 0,
                    y: 30,
                    duration: 0.6,
                    stagger: 0.1,
                    ease: 'power2.out'
                });
            }
        }
        
        // Update active nav item
        document.querySelectorAll('[data-section]').forEach(item => {
            item.classList.remove('active');
        });
        const activeItem = document.querySelector(`[data-section="${section}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
        
        this.currentSection = section;
        this.loadSectionData(section);
    }
    
    initializeCharts() {
        // Prediction Rate Chart
        const prCtx = document.getElementById('predictionRateChart');
        if (prCtx) {
            this.charts.predictionRate = new Chart(prCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Predictions/min',
                        data: [],
                        borderColor: '#00f0ff',
                        backgroundColor: 'rgba(0, 240, 255, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHitRadius: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            display: false 
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `Predictions: ${context.parsed.y}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { 
                                color: '#a0a0b0', 
                                maxTicksLimit: 10,
                                maxRotation: 45
                            }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: '#a0a0b0' },
                            beginAtZero: true
                        }
                    },
                    animation: { 
                        duration: 750, 
                        easing: 'easeInOutQuart' 
                    }
                }
            });
        }
        
        // Latency Distribution Chart
        const ldCtx = document.getElementById('latencyDistributionChart');
        if (ldCtx) {
            this.charts.latencyDist = new Chart(ldCtx, {
                type: 'bar',
                data: {
                    labels: ['<50ms', '50-100ms', '100-250ms', '250-500ms', '>500ms'],
                    datasets: [{
                        label: 'Requests',
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(16, 185, 129, 0.7)',
                            'rgba(0, 240, 255, 0.7)',
                            'rgba(245, 158, 11, 0.7)',
                            'rgba(249, 115, 22, 0.7)',
                            'rgba(239, 68, 68, 0.7)'
                        ],
                        borderColor: [
                            '#10b981', '#00f0ff', '#f59e0b', '#f97316', '#ef4444'
                        ],
                        borderWidth: 1,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.parsed.y} requests`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: '#a0a0b0' },
                            beginAtZero: true
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#a0a0b0' }
                        }
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeOutBounce'
                    }
                }
            });
        }
        
        // Risk Distribution Doughnut
        const rdCtx = document.getElementById('riskDistributionDoughnut');
        if (rdCtx) {
            this.charts.riskDist = new Chart(rdCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
                    datasets: [{
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: [
                            '#10b981', '#34d399', '#fbbf24', '#f97316', '#ef4444'
                        ],
                        borderWidth: 0,
                        hoverBorderWidth: 3,
                        hoverBorderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { 
                                color: '#a0a0b0', 
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? (context.parsed / total * 100).toFixed(1) : 0;
                                    return `${context.label}: ${context.parsed} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateScale: true,
                        animateRotate: true,
                        duration: 2000
                    }
                }
            });
        }
        
        // Resource Timeline
        const rtCtx = document.getElementById('resourceTimeline');
        if (rtCtx) {
            this.charts.resources = new Chart(rtCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'CPU',
                            data: [],
                            borderColor: '#00f0ff',
                            backgroundColor: 'rgba(0, 240, 255, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 0
                        },
                        {
                            label: 'Memory',
                            data: [],
                            borderColor: '#7c3aed',
                            backgroundColor: 'rgba(124, 58, 237, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#a0a0b0' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: '#a0a0b0' }
                        },
                        x: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: '#a0a0b0' }
                        }
                    }
                }
            });
        }
    }
    
    updateRealTimeMetrics(data) {
        if (!data) return;
        
        // Update active connections
        if (data.active_connections !== undefined) {
            this.animateValue('activeConnections', data.active_connections);
        }
        
        // Update avg latency
        if (data.avg_latency_ms !== undefined) {
            this.animateValue('avgLatency', Math.round(data.avg_latency_ms) + 'ms');
        } else if (data.latency && data.latency.average_ms !== undefined) {
            this.animateValue('avgLatency', Math.round(data.latency.average_ms) + 'ms');
        }
        
        // Update system metrics
        if (data.system_metrics) {
            const cpu = document.getElementById('cpuValue');
            const memory = document.getElementById('memoryValue');
            
            if (cpu && data.system_metrics.cpu) {
                cpu.textContent = Math.round(data.system_metrics.cpu.percent || 0) + '%';
            }
            if (memory && data.system_metrics.memory) {
                memory.textContent = Math.round(data.system_metrics.memory.percent || 0) + '%';
            }
            
            // Update resource timeline
            if (this.charts.resources) {
                const chart = this.charts.resources;
                const now = new Date().toLocaleTimeString();
                
                chart.data.labels.push(now);
                chart.data.datasets[0].data.push(data.system_metrics.cpu?.percent || 0);
                chart.data.datasets[1].data.push(data.system_metrics.memory?.percent || 0);
                
                if (chart.data.labels.length > 30) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                    chart.data.datasets[1].data.shift();
                }
                chart.update('none');
            }
        }
        
        // Update prediction rate chart
        if (data.prediction_rate && this.charts.predictionRate) {
            const chart = this.charts.predictionRate;
            const latest = data.prediction_rate;
            
            if (latest.length > 0) {
                // Clear and rebuild with latest data
                chart.data.labels = latest.map(p => {
                    const t = p.timestamp || p._id;
                    return t ? new Date(t).toLocaleTimeString() : '';
                });
                chart.data.datasets[0].data = latest.map(p => p.count || p.value || 0);
                chart.update('none');
            }
        }
    }
    
    updateAllMetrics(data) {
        if (!data) return;
        
        // Update total predictions
        if (data.total_predictions !== undefined) {
            this.animateValue('totalPredictions', data.total_predictions);
        }
        
        // Update active connections
        if (data.active_connections !== undefined) {
            this.animateValue('activeConnections', data.active_connections);
        } else if (data.active_users !== undefined) {
            this.animateValue('activeConnections', data.active_users);
        }
        
        // Update avg latency
        let avgLatency = 0;
        if (data.avg_latency_ms !== undefined) {
            avgLatency = data.avg_latency_ms;
        } else if (data.latency && data.latency.average_ms !== undefined) {
            avgLatency = data.latency.average_ms;
        }
        if (avgLatency > 0 || data.avg_latency_ms === 0) {
            this.animateValue('avgLatency', Math.round(avgLatency) + 'ms');
        }
        
        // Update system metrics (CPU, Memory, Disk)
        if (data.system_metrics) {
            const cpu = document.getElementById('cpuValue');
            const memory = document.getElementById('memoryValue');
            const disk = document.getElementById('diskValue');
            const cpuBar = document.getElementById('cpuBar');
            const memoryBar = document.getElementById('memoryBar');
            const diskBar = document.getElementById('diskBar');
            
            if (cpu && data.system_metrics.cpu) {
                const cpuPercent = Math.round(data.system_metrics.cpu.percent || 0);
                cpu.textContent = cpuPercent + '%';
                if (cpuBar) cpuBar.style.width = cpuPercent + '%';
            }
            if (memory && data.system_metrics.memory) {
                const memPercent = Math.round(data.system_metrics.memory.percent || 0);
                memory.textContent = memPercent + '%';
                if (memoryBar) memoryBar.style.width = memPercent + '%';
            }
            if (disk && data.system_metrics.disk) {
                const diskPercent = Math.round(data.system_metrics.disk.percent || 0);
                disk.textContent = diskPercent + '%';
                if (diskBar) diskBar.style.width = diskPercent + '%';
            }
            
            // Update resource timeline
            if (this.charts.resources) {
                const chart = this.charts.resources;
                const now = new Date().toLocaleTimeString();
                
                chart.data.labels.push(now);
                chart.data.datasets[0].data.push(data.system_metrics.cpu?.percent || 0);
                chart.data.datasets[1].data.push(data.system_metrics.memory?.percent || 0);
                
                if (chart.data.labels.length > 30) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                    chart.data.datasets[1].data.shift();
                }
                chart.update('none');
            }
        }
        
        // Update risk distribution if available
        if (data.risk_distribution && this.charts.riskDist) {
            const order = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
            const chartData = order.map(label => {
                return data.risk_distribution[label] || 0;
            });
            this.charts.riskDist.data.datasets[0].data = chartData;
            this.charts.riskDist.update('none');
        }
        
        // Update prediction rates if available (supports both prediction_rates and prediction_rate)
        const predictionRates = data.prediction_rates || data.prediction_rate;
        if (predictionRates && this.charts.predictionRate) {
            const chart = this.charts.predictionRate;
            chart.data.labels = predictionRates.map(r => {
                const t = r.timestamp || r._id;
                return t ? new Date(t).toLocaleTimeString() : '';
            });
            chart.data.datasets[0].data = predictionRates.map(r => r.count || r.value || 0);
            chart.update('none');
        }
        
        // Update latency distribution if available
        if (data.latency_distribution && this.charts.latencyDist) {
            const rangeMap = {
                '<50ms': 0,
                '50-100ms': 1,
                '100-250ms': 2,
                '250-500ms': 3,
                '>500ms': 4
            };
            const counts = [0, 0, 0, 0, 0];
            data.latency_distribution.forEach(item => {
                const range = item.range || item._id || '';
                const idx = rangeMap[range];
                if (idx !== undefined) {
                    counts[idx] = item.count || 0;
                }
            });
            // Only update if we have new data
            if (counts.some(c => c > 0) || this.charts.latencyDist.data.datasets[0].data.some(c => c > 0)) {
                this.charts.latencyDist.data.datasets[0].data = counts;
                this.charts.latencyDist.update('none');
            }
        }
        
        // Update performance metrics if available
        if (data.performance_metrics) {
            const aucElement = document.getElementById('aucScore');
            const f1Element = document.getElementById('f1Score');
            const precisionElement = document.getElementById('precision');
            const recallElement = document.getElementById('recall');
            
            if (aucElement) aucElement.textContent = (data.performance_metrics.auc_roc || 0).toFixed(3);
            if (f1Element) f1Element.textContent = (data.performance_metrics.f1_score || 0).toFixed(3);
            if (precisionElement) precisionElement.textContent = (data.performance_metrics.precision || 0).toFixed(3);
            if (recallElement) recallElement.textContent = (data.performance_metrics.recall || 0).toFixed(3);
            
            const modelAccuracyElement = document.getElementById('modelAccuracy');
            if (modelAccuracyElement && data.performance_metrics.accuracy) {
                modelAccuracyElement.textContent = Math.round(data.performance_metrics.accuracy * 100) + '%';
            }
        }
        
        // Update migration analysis if available
        if (data.migration_analysis) {
            const stayedCount = document.getElementById('stayedCount');
            const upgradedCount = document.getElementById('upgradedCount');
            const downgradedCount = document.getElementById('downgradedCount');
            
            if (stayedCount) stayedCount.textContent = data.migration_analysis.stayed || 0;
            if (upgradedCount) upgradedCount.textContent = data.migration_analysis.upgraded || 0;
            if (downgradedCount) downgradedCount.textContent = data.migration_analysis.downgraded || 0;
        }
    }
    
    addLivePrediction(prediction) {
        if (!prediction) return;
        
        const container = document.getElementById('live-predictions');
        if (container) {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 rounded-xl bg-white/5 animate-slide-in border border-white/5';
            
            const loanId = prediction.loan_id || prediction.input?.loan_id || '—';
            const riskTier = prediction.risk_tier || prediction.output?.risk_tier || 'Unknown';
            const probability = prediction.migration_probability ?? prediction.output?.migration_probability ?? 0;
            const latency = prediction.processing_time_ms ?? prediction.latency ?? 0;
            
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full ${this.getRiskColor(riskTier)} shadow-[0_0_8px_${this.getRiskColor(riskTier).replace('bg-','')}]"></span>
                    <span class="font-mono text-sm">${loanId}</span>
                    <span class="px-2 py-1 rounded text-xs ${this.getRiskBgColor(riskTier)}">${riskTier}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-sm font-bold">${(probability * 100).toFixed(1)}%</span>
                    <span class="text-xs text-gray-400">${Math.round(latency)}ms</span>
                </div>
            `;
            
            container.insertBefore(item, container.firstChild);
            
            // Limit to 20 items for grander feed
            while (container.children.length > 20) {
                container.removeChild(container.lastChild);
            }
        }
        
        // Increment total predictions
        const totalElement = document.getElementById('totalPredictions');
        if (totalElement) {
            const currentTotal = parseInt(totalElement.textContent.replace(/,/g, '')) || 0;
            this.animateValue('totalPredictions', currentTotal + 1);
        }
        
        // Update prediction rate chart
        if (this.charts.predictionRate) {
            const chart = this.charts.predictionRate;
            const now = new Date().toLocaleTimeString();
            const lastLabel = chart.data.labels[chart.data.labels.length - 1];
            
            if (lastLabel !== now) {
                chart.data.labels.push(now);
                chart.data.datasets[0].data.push(1);
                if (chart.data.labels.length > 30) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                }
            } else {
                const lastIdx = chart.data.datasets[0].data.length - 1;
                chart.data.datasets[0].data[lastIdx] = (chart.data.datasets[0].data[lastIdx] || 0) + 1;
            }
            chart.update('none');
        }
        
        // Update latency distribution carefully
        if (this.charts.latencyDist && prediction.processing_time_ms !== undefined) {
            const latency = prediction.processing_time_ms;
            let index = 4; // >500ms
            if (latency < 50) index = 0;
            else if (latency < 100) index = 1;
            else if (latency < 250) index = 2;
            else if (latency < 500) index = 3;
            
            // Ensure dataset data exists
            if (!this.charts.latencyDist.data.datasets[0].data || this.charts.latencyDist.data.datasets[0].data.length === 0) {
                this.charts.latencyDist.data.datasets[0].data = [0, 0, 0, 0, 0];
            }
            
            this.charts.latencyDist.data.datasets[0].data[index] = 
                (this.charts.latencyDist.data.datasets[0].data[index] || 0) + 1;
            this.charts.latencyDist.update('none');
        }
        
        // Update risk distribution carefully to avoid blinking
        if (this.charts.riskDist && prediction.risk_tier) {
            const riskMap = {
                'Very Low': 0,
                'Low': 1,
                'Medium': 2,
                'High': 3,
                'Very High': 4
            };
            const idx = riskMap[prediction.risk_tier];
            if (idx !== undefined) {
                // Ensure dataset exists
                if (!this.charts.riskDist.data.datasets[0].data || this.charts.riskDist.data.datasets[0].data.length === 0) {
                    this.charts.riskDist.data.datasets[0].data = [0, 0, 0, 0, 0];
                }
                const currentData = [...this.charts.riskDist.data.datasets[0].data];
                currentData[idx] = (currentData[idx] || 0) + 1;
                this.charts.riskDist.data.datasets[0].data = currentData;
                this.charts.riskDist.update('none');
            }
        }
    }
    
    getRiskColor(tier) {
        const colors = {
            'Very High': 'bg-red-400',
            'High': 'bg-orange-400',
            'Medium': 'bg-yellow-400',
            'Low': 'bg-green-400',
            'Very Low': 'bg-emerald-400'
        };
        return colors[tier] || 'bg-gray-400';
    }
    
    getRiskBgColor(tier) {
        const colors = {
            'Very High': 'bg-red-400/20 text-red-400',
            'High': 'bg-orange-400/20 text-orange-400',
            'Medium': 'bg-yellow-400/20 text-yellow-400',
            'Low': 'bg-green-400/20 text-green-400',
            'Very Low': 'bg-emerald-400/20 text-emerald-400'
        };
        return colors[tier] || 'bg-gray-400/20 text-gray-400';
    }
    
    animateValue(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Parse current value
        let currentValue = 0;
        const currentText = element.textContent || '';
        const numericMatch = currentText.match(/[\d,]+/);
        if (numericMatch) {
            currentValue = parseInt(numericMatch[0].replace(/,/g, '')) || 0;
        }
        
        // Parse target value
        let targetValue = 0;
        if (typeof newValue === 'string') {
            const targetMatch = newValue.match(/[\d,]+/);
            if (targetMatch) {
                targetValue = parseInt(targetMatch[0].replace(/,/g, '')) || 0;
            }
        } else {
            targetValue = newValue || 0;
        }
        
        // If values are same or target is 0, just update
        if (currentValue === targetValue || targetValue === 0) {
            if (typeof newValue === 'string' && newValue.includes('ms')) {
                element.textContent = targetValue + 'ms';
            } else {
                element.textContent = targetValue.toLocaleString();
            }
            return;
        }
        
        const duration = 800;
        const startTime = performance.now();
        const isMs = typeof newValue === 'string' && newValue.includes('ms');
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(currentValue + (targetValue - currentValue) * eased);
            
            if (isMs) {
                element.textContent = current + 'ms';
            } else {
                element.textContent = current.toLocaleString();
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    async fetchInitialData() {
        try {
            window.dispatchEvent(new CustomEvent('monitoring-loading'));
            const timeRange = document.getElementById('timeRange')?.value || '24h';
            
            const response = await fetch(`/api/v1/monitoring/overview?time_range=${timeRange}`, {
                credentials: 'include',
                headers: { 
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateAllMetrics(data);
            } else {
                console.warn('Failed to fetch monitoring overview:', response.status);
                const errEl = document.getElementById('monitoring-error');
                if (errEl) {
                    errEl.innerHTML = `<div class="text-sm text-yellow-400">Unable to load historical data (status: ${response.status}). Showing live metrics only.</div>`;
                }
            }
            window.dispatchEvent(new CustomEvent('monitoring-loaded'));
            
            // Request metrics snapshot via WebSocket if available
            if (window.wsStatus && window.wsStatus.ws && window.wsStatus.ws.readyState === WebSocket.OPEN) {
                try {
                    window.wsStatus.sendMessage({ type: 'request_metrics' });
                } catch (e) {
                    console.warn('Failed to request metrics snapshot:', e);
                }
            }
            
            // Also fetch performance metrics to hydrate the overview card
            this.loadSectionData('performance');
        } catch (error) {
            console.error('Failed to fetch monitoring data:', error);
            window.dispatchEvent(new CustomEvent('monitoring-error', { detail: { error: String(error) } }));
        }
    }
    
    async loadSectionData(section) {
        try {
            window.dispatchEvent(new CustomEvent('monitoring-section-loading', { detail: { section } }));
                        const timeRange = document.getElementById('timeRange')?.value || '24h';
            let url = `/api/v1/monitoring/${section}?time_range=${timeRange}`;
            if (section === 'predictions') {
                const params = new URLSearchParams(window.location.search);
                const page = params.get('page') || '1';
                const search = params.get('q') || '';
                const risk = params.get('risk') || '';
                const limit = params.get('limit') || '50';
                url += `&page=${page}&limit=${limit}`;
                if (search) url += `&search=${encodeURIComponent(search)}`;
                if (risk) url += `&risk_filter=${encodeURIComponent(risk)}`;
            }
            const response = await fetch(url, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                switch(section) {
                    case 'performance':
                        this.updatePerformanceMetrics(data);
                        break;
                    case 'risk':
                        this.updateRiskData(data);
                        break;
                    case 'predictions':
                        this.updatePredictionsTable(data);
                        break;
                    case 'resources':
                        this.updateResourceData(data);
                        break;
                    case 'logs':
                        this.updateAuditLogs(data);
                        break;
                    case 'alerts':
                        this.updateAlerts(data);
                        break;
                    default:
                        console.log('No specific handler for section:', section);
                }
            } else {
                console.warn(`Failed to load ${section} data:`, response.status);
                window.dispatchEvent(new CustomEvent('monitoring-section-error', { detail: { section, status: response.status } }));
            }
            window.dispatchEvent(new CustomEvent('monitoring-section-loaded', { detail: { section } }));
        } catch (error) {
            console.error(`Failed to load ${section} data:`, error);
            window.dispatchEvent(new CustomEvent('monitoring-section-error', { detail: { section, error: String(error) } }));
        }
    }
    
    updatePerformanceMetrics(data) {
        if (!data) return;
        
        const aucElement = document.getElementById('aucScore');
        const f1Element = document.getElementById('f1Score');
        const precisionElement = document.getElementById('precision');
        const recallElement = document.getElementById('recall');
        
        if (aucElement) aucElement.textContent = (data.auc_roc || 0).toFixed(3);
        if (f1Element) f1Element.textContent = (data.f1_score || 0).toFixed(3);
        if (precisionElement) precisionElement.textContent = (data.precision || 0).toFixed(3);
        if (recallElement) recallElement.textContent = (data.recall || 0).toFixed(3);
        
        const modelAccuracyElement = document.getElementById('modelAccuracy');
        if (modelAccuracyElement && data.accuracy) {
            modelAccuracyElement.textContent = Math.round(data.accuracy * 100) + '%';
        }
    }
    
    updateRiskData(data) {
        if (!data) return;
        
        // Update Chart
        if (this.charts.riskDist) {
            const order = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
            const distribution = data.risk_distribution || [];
            
            const chartData = order.map(label => {
                const item = distribution.find(d => d.tier === label || d._id === label);
                return item ? (item.count || item.value || 0) : 0;
            });
            
            this.charts.riskDist.data.datasets[0].data = chartData;
            this.charts.riskDist.update('none');
        }
        
        // Update Migration Analysis
        if (data.migration) {
            const stayedCount = document.getElementById('stayedCount');
            const upgradedCount = document.getElementById('upgradedCount');
            const downgradedCount = document.getElementById('downgradedCount');
            
            if (stayedCount) stayedCount.textContent = data.migration.stayed || 0;
            if (upgradedCount) upgradedCount.textContent = data.migration.upgraded || 0;
            if (downgradedCount) downgradedCount.textContent = data.migration.downgraded || 0;
        }
    }
    
    updateAuditLogs(data) {
        const container = document.getElementById('auditLogs');
        if (!container) return;
        
        const logs = data.logs || [];
        container.innerHTML = '';
        
        if (logs.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No recent audit logs found.</p>';
            return;
        }
        
        logs.forEach(log => {
            const el = document.createElement('div');
            el.className = 'neo-element p-4 flex flex-col gap-2 animate-slide-in';
            const time = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown';
            el.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="text-sm text-cyan-400 font-mono">${log.action || 'Event'}</span>
                    <span class="text-xs text-gray-500">${time}</span>
                </div>
                <p class="text-sm text-gray-300">${log.details || JSON.stringify(log)}</p>
                <div class="text-xs text-gray-400">User: ${log.user_id || 'System'}</div>
            `;
            container.appendChild(el);
        });
    }
    
    updateAlerts(data) {
        const container = document.getElementById('activeAlerts');
        if (!container) return;
        
        // For demonstration, since the endpoint is not fully defined
        const alerts = data.alerts || [
            { severity: 'info', message: 'Monitoring system initialized successfully', timestamp: new Date().toISOString() }
        ];
        
        container.innerHTML = '';
        if (alerts.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No active alerts.</p>';
            return;
        }
        
        alerts.forEach(alert => {
            const el = document.createElement('div');
            const severityClass = alert.severity === 'critical' ? 'border-red-400 bg-red-400/10 text-red-400' :
                                 alert.severity === 'warning' ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' :
                                 'border-cyan-400 bg-cyan-400/10 text-cyan-400';
            
            el.className = `p-4 rounded-xl border-l-4 ${severityClass} mb-4 flex justify-between items-center animate-slide-in`;
            const time = alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'Unknown';
            const ackButton = alert.acknowledged ? '<span class="text-sm text-gray-400">Acknowledged</span>' : `<button class="ack-alert text-sm underline text-cyan-400" data-id="${alert._id}">Acknowledge</button>`;
            el.innerHTML = `
                <div>
                    <p class="font-semibold">${alert.message || 'Alert'}</p>
                    <p class="text-sm opacity-70">${time}</p>
                </div>
                <div>${ackButton}</div>
            `;
            container.appendChild(el);
        });

        // Attach ack handlers
        container.querySelectorAll('.ack-alert').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.dataset.id;
                try {
                    const resp = await fetch(`/api/v1/monitoring/alerts/ack/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'include' });
                    if (resp.ok) {
                        btn.outerHTML = '<span class="text-sm text-gray-400">Acknowledged</span>';
                    } else {
                        toast?.error('Failed to acknowledge alert');
                    }
                } catch (err) {
                    console.error('Ack failed', err);
                    toast?.error('Failed to acknowledge alert');
                }
            });
        });
    }
    
    updatePredictionsTable(data) {
        const tbody = document.getElementById('predictionsTableBody');
        if (!tbody) return;
        const predictions = data.predictions || data.recent_predictions || [];
        const total = data.total || predictions.length;
        const page = data.page || 1;
        const pages = data.pages || 1;
        tbody.innerHTML = '';

        predictions.forEach(prediction => {
            const row = document.createElement('tr');
            const riskTier = prediction.risk_tier || prediction.output?.risk_tier || 'Unknown';
            const color = this.getRiskColor(riskTier).replace('bg-', '').replace('-400', '');
            
            row.innerHTML = `
                <td class="font-mono text-sm">${prediction.loan_id || prediction.input?.loan_id || '—'}</td>
                <td>
                    <span class="px-3 py-1 rounded-full text-xs bg-${color}-400/20 text-${color}-400 border border-${color}-400/40">
                        ${riskTier}
                    </span>
                </td>
                <td class="font-bold">${((prediction.migration_probability || prediction.output?.migration_probability || 0) * 100).toFixed(1)}%</td>
                <td>${(prediction.predicted_migration || prediction.output?.predicted_migration) ? 'Stage 2' : 'Stage 1'}</td>
                <td class="text-gray-400">${prediction.processing_time_ms || prediction.latency || 0}ms</td>
                <td class="text-gray-500 text-sm">${prediction.timestamp ? new Date(prediction.timestamp).toLocaleString() : '—'}</td>
                <td>
                    <button class="text-cyan-400 hover:underline text-sm" data-loan="${prediction.loan_id || 'unknown'}" onclick="window.monitoring.showPredictionDetails('${prediction.loan_id || 'unknown'}')">
                        Details
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Pagination footer
        const pager = document.getElementById('predictionsPager');
        if (pager) {
            pager.innerHTML = `Page ${page} of ${pages} — ${total} total`;
            try { pager.dataset.total = pages; } catch(e) { /* ignore */ }
        }
    }
    
    updateResourceData(data) {
        if (!data) return;
        
        const cpuElement = document.getElementById('cpuValue');
        const memoryElement = document.getElementById('memoryValue');
        const diskElement = document.getElementById('diskValue');
        
        if (cpuElement) {
            cpuElement.textContent = `${Math.round(data.cpu_percent || data.system_metrics?.cpu?.percent || 0)}%`;
        }
        if (memoryElement) {
            memoryElement.textContent = `${Math.round(data.memory_percent || data.system_metrics?.memory?.percent || 0)}%`;
        }
        if (diskElement) {
            diskElement.textContent = `${Math.round(data.disk_percent || data.system_metrics?.disk?.percent || 0)}%`;
        }
        
        // Update resource chart
        if (this.charts.resources) {
            const chart = this.charts.resources;
            const now = new Date().toLocaleTimeString();
            
            chart.data.labels.push(now);
            chart.data.datasets[0].data.push(data.cpu_percent || data.system_metrics?.cpu?.percent || 0);
            chart.data.datasets[1].data.push(data.memory_percent || data.system_metrics?.memory?.percent || 0);
            
            if (chart.data.labels.length > 30) {
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
                chart.data.datasets[1].data.shift();
            }
            chart.update('none');
        }
    }
    
    showPredictionDetails(loanId) {
        // Fetch prediction details and show in modal
        (async () => {
            try {
                const resp = await fetch(`/api/v1/monitoring/prediction/${encodeURIComponent(loanId)}`, { credentials: 'include' });
                if (!resp.ok) {
                    alert('Failed to load details');
                    return;
                }
                const data = await resp.json();
                const preds = data.predictions || [];
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60';
                modal.innerHTML = `
                    <div class="bg-gray-900 rounded-lg w-11/12 max-w-3xl p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-bold">Prediction Details: ${loanId}</h3>
                            <button id="closePredModal" class="text-gray-400 hover:text-white">Close</button>
                        </div>
                        <div style="max-height:60vh; overflow:auto;">
                            ${preds.map(p => `<div class=\"mb-3 p-3 bg-black/20 rounded\">Time: ${p.timestamp || ''}<br/>Risk: ${p.risk_tier || p.output?.risk_tier || ''}<br/>Probability: ${((p.migration_probability||p.output?.migration_probability||0)*100).toFixed(2)}%<br/>Processing: ${p.processing_time_ms || p.latency || p.latency_ms || 0}ms<br/>Raw: <pre style=\"white-space:pre-wrap;\">${JSON.stringify(p, null, 2)}</pre></div>`).join('')}
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                document.getElementById('closePredModal').addEventListener('click', () => modal.remove());
            } catch (e) {
                console.error('Failed to fetch prediction details:', e);
                alert('Failed to load details');
            }
        })();
    }
    
    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        
        this.autoRefreshInterval = setInterval(() => {
            const autoRefreshCheckbox = document.getElementById('autoRefresh');
            if (autoRefreshCheckbox && autoRefreshCheckbox.checked) {
                this.fetchInitialData();
                if (this.currentSection !== 'overview') {
                    this.loadSectionData(this.currentSection);
                }
            }
        }, 10000); // Refresh every 10 seconds
    }
    
    setupEventListeners() {
        // Auto-refresh toggle
        const autoRefreshCheckbox = document.getElementById('autoRefresh');
        if (autoRefreshCheckbox) {
            autoRefreshCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    if (this.autoRefreshInterval) {
                        clearInterval(this.autoRefreshInterval);
                        this.autoRefreshInterval = null;
                    }
                }
            });
        }
        
        // Time range selector
        const timeRangeSelect = document.getElementById('timeRange');
        if (timeRangeSelect) {
            timeRangeSelect.addEventListener('change', () => {
                this.fetchInitialData();
                if (this.currentSection !== 'overview') {
                    this.loadSectionData(this.currentSection);
                }
            });
        }
        
        // Refresh button
        const refreshButton = document.querySelector('[onclick="refreshData()"]');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                this.refreshData();
            });
        }
    }
    
    async refreshData() {
        // Show refresh indicator
        this.showRefreshIndicator();
        
        // Refresh data
        await this.fetchInitialData();
        if (this.currentSection !== 'overview') {
            await this.loadSectionData(this.currentSection);
        }
    }
    
    showRefreshIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-cyan-400/20 text-cyan-400 px-4 py-2 rounded-full text-sm z-50 backdrop-blur-sm';
        indicator.textContent = '✓ Data refreshed';
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            indicator.style.transition = 'opacity 0.3s, transform 0.3s';
            indicator.style.opacity = '0';
            indicator.style.transform = 'translateY(-20px)';
            setTimeout(() => indicator.remove(), 300);
        }, 2000);
    }
    
    updateConnectionStatus(connected) {
        const badge = document.getElementById('ws-status-badge');
        if (badge) {
            badge.className = connected ? 
                'px-3 py-1 rounded-full text-xs bg-green-400/10 text-green-400 border border-green-400/20' :
                'px-3 py-1 rounded-full text-xs bg-red-400/10 text-red-400 border border-red-400/20';
            badge.innerHTML = connected ? 
                '<i class="fas fa-circle text-[6px] mr-1"></i> Connected' :
                '<i class="fas fa-circle text-[6px] mr-1"></i> Disconnected';
        }
    }
    
    showAlert(alert) {
        const container = document.getElementById('alert-container');
        if (!container) return;
        
        const alertEl = document.createElement('div');
        const severityClass = alert.severity === 'critical' ? 'border-red-400 bg-red-400/10' :
                             alert.severity === 'warning' ? 'border-yellow-400 bg-yellow-400/10' :
                             'border-cyan-400 bg-cyan-400/10';
        
        alertEl.className = `p-4 rounded-xl border-l-4 ${severityClass} mb-4 animate-slide-in`;
        alertEl.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <p class="font-semibold">${alert.message || 'Alert'}</p>
                    <p class="text-sm text-gray-400">${alert.timestamp ? new Date(alert.timestamp).toLocaleString() : new Date().toLocaleString()}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="text-gray-500 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        container.insertBefore(alertEl, container.firstChild);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (alertEl.parentElement) {
                alertEl.style.transition = 'opacity 0.3s, transform 0.3s';
                alertEl.style.opacity = '0';
                alertEl.style.transform = 'translateX(20px)';
                setTimeout(() => alertEl.remove(), 300);
            }
        }, 10000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.monitoring = new MonitoringDashboard();
});

// Global refresh function for inline onclick
function refreshData() {
    if (window.monitoring) {
        window.monitoring.refreshData();
    }
}