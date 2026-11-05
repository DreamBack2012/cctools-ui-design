import { state, getDevice, availability, actionLabels, timeLabel } from './store.js';

let sequence = 1;
export function createTask(action, ids, options = {}) {
    if (!ids.length) throw new Error('请至少选择一台设备');
    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) {
        const device = getDevice(id);
        if (!device) throw new Error('目标设备不存在');
        const reason = ['burn', 'factory', 'sn'].includes(action)
            ? (state.tasks.some(task => task.items.some(item => item.deviceId === id && ['queued', 'running', 'waiting'].includes(item.status))) ? '设备有正在执行的任务' : '')
            : availability(device, action);
        if (reason) throw new Error(`${device.name}：${reason}`);
    }
    const task = {
        id: `TK-${String(sequence++).padStart(4, '0')}`, action, label: actionLabels[action],
        created: timeLabel(), date: new Date().toISOString().slice(0, 10), options: structuredClone(options),
        items: uniqueIds.map((id, index) => {
            const device = getDevice(id);
            return { deviceId: id, name: device.name, sn: device.sn, model: device.model, status: 'queued', progress: 0,
                failOnce: !!options.demoFailure && index === uniqueIds.length - 1, error: '',
                logs: [`${timeLabel()} 任务已创建，等待执行`], review: null };
        }),
    };
    state.tasks.unshift(task);
    return task;
}
export function taskStatus(task) {
    if (task.items.some(item => ['running', 'queued'].includes(item.status))) return 'running';
    if (task.items.some(item => item.status === 'waiting')) return 'waiting';
    if (task.items.some(item => item.status === 'failed')) return 'failed';
    if (task.items.every(item => item.status === 'cancelled')) return 'cancelled';
    return 'success';
}
export function taskProgress(task) { return Math.round(task.items.reduce((sum, item) => sum + item.progress, 0) / task.items.length); }
export function tickTasks() {
    let changed = false;
    for (const task of state.tasks) {
        const running = task.items.filter(item => item.status === 'running');
        const slots = Math.max(0, state.maxConcurrent - running.length);
        task.items.filter(item => item.status === 'queued').slice(0, slots).forEach(item => {
            item.status = 'running';
            item.logs.push(`${timeLabel()} 执行前检查通过，开始${task.label}`);
            changed = true;
        });
        for (const item of task.items.filter(item => item.status === 'running')) {
            changed = true;
            if (item.pauseTicks > 0) { item.pauseTicks--; continue; }
            item.progress = Math.min(100, item.progress + 7);
            if (item.failOnce && item.progress >= 56) {
                item.status = 'failed';
                item.error = '通信超时，请检查设备连接后重试';
                item.logs.push(`${timeLabel()} ${item.error}`);
                continue;
            }
            if (task.action === 'factory' && task.options.stage !== '老化' && (!task.options.items || task.options.items.includes('LED')) && item.progress >= 70 && item.review === null) {
                item.status = 'waiting';
                item.logs.push(`${timeLabel()} LED 正在持续闪烁，等待测试人员确认`);
                continue;
            }
            if (task.action === 'factory' && task.options.stage === '老化' && item.progress === 100) {
                item.cycles = (item.cycles || 0) + 1; item.progress = 0; item.pauseTicks = 7;
                item.logs = [...item.logs.slice(-98), `${timeLabel()} 老化第 ${item.cycles} 轮结束，等待 5 秒开始下一轮`];
                continue;
            }
            if (item.progress === 100) {
                item.status = 'success';
                item.logs.push(`${timeLabel()} ${task.label}完成`);
            }
        }
    }
    return changed;
}
export function retryFailed(task) {
    const ids = task.items.filter(item => item.status === 'failed').map(item => item.deviceId);
    return createTask(task.action, ids, { ...task.options, demoFailure: false, retryOf: task.id });
}
export function cancelQueued(task) {
    task.items.filter(item => item.status === 'queued').forEach(item => {
        item.status = 'cancelled';
        item.logs.push(`${timeLabel()} 已取消待执行任务`);
    });
}
export function confirmLed(task, id, passed) {
    const item = task.items.find(entry => entry.deviceId === id);
    if (!item || item.status !== 'waiting') return;
    item.review = passed;
    item.status = passed ? 'running' : 'failed';
    item.error = passed ? '' : '测试人员确认 LED 显示异常';
    item.logs.push(`${timeLabel()} LED 人工确认：${passed ? '通过' : '失败'}`);
}
