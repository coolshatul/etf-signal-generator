import { buildPerformanceReport } from '../reports/performanceReport';
import { sendPerformanceReportEmail } from '../alerts/email';
import { ALERT_CHANNELS } from '../config/settings';

/**
 * Weekly performance digest. Runs on Saturday morning so it covers the whole
 * trading week, including Friday's close.
 */
export const handler = async (): Promise<void> => {
    console.log('📊 Starting weekly performance report...');

    if (!ALERT_CHANNELS.email) {
        console.log('📭 Email alerts disabled; skipping weekly report.');
        return;
    }

    try {
        const report = await buildPerformanceReport(7);

        if (report.totalClosed === 0 && report.totalOpen === 0) {
            console.log('📭 No trades to report this week.');
            return;
        }

        await sendPerformanceReportEmail(report);

        console.log(
            `✅ Weekly report sent: ${report.totalClosed} closed, ${report.totalOpen} open.`
        );
    } catch (err) {
        console.error('❌ Error building weekly performance report:', err);
    }

    console.log('🎯 Weekly performance report completed.');
};
