window.currentFinancialBasis = window.currentFinancialBasis || 'daily';

window.changeFinancialBasis = function(basis) {
  window.currentFinancialBasis = basis;
  const userStr = localStorage.getItem("active_user");
  if (userStr) {
    const user = JSON.parse(userStr);
    let normalizedRole = user.role;
    if (normalizedRole === "ADMIN") normalizedRole = "Admin";
    if (normalizedRole === "DIRECTOR") normalizedRole = "Director";
    renderPortalDashboard(normalizedRole);
  }
};

function getLedgerHtml() {
  const basis = window.currentFinancialBasis || 'daily';
  
  // Aggregate agreements by period and creator role
  const groups = {};
  
  auditAgreements.forEach(agreement => {
    let dateStr = agreement.date || new Date().toISOString().split('T')[0];
    let periodKey = "";
    
    if (basis === 'daily') {
      periodKey = dateStr;
    } else if (basis === 'monthly') {
      periodKey = dateStr.substring(0, 7); // "YYYY-MM"
    } else if (basis === 'yearly') {
      periodKey = dateStr.substring(0, 4); // "YYYY"
    }
    
    if (!groups[periodKey]) {
      groups[periodKey] = { 
        coD_payable: 0, coD_gain: 0,
        employee_payable: 0, employee_gain: 0,
        user_payable: 0, user_gain: 0,
        total_payable: 0, total_gain: 0
      };
    }
    
    const role = (agreement.creatorRole || "USER").toUpperCase();
    const payableVal = parseFloat(agreement.payable) || 0;
    // Fallback if gain is not defined: estimate as 25% of payable
    const gainVal = parseFloat(agreement.gain !== undefined ? agreement.gain : (payableVal * 0.25)) || 0;
    
    if (role === 'CO_DIRECTOR' || role === 'DIRECTOR' || role === 'MD' || role === 'ADMIN') {
      groups[periodKey].coD_payable += payableVal;
      groups[periodKey].coD_gain += gainVal;
    } else if (role === 'EMPLOYEE') {
      groups[periodKey].employee_payable += payableVal;
      groups[periodKey].employee_gain += gainVal;
    } else {
      groups[periodKey].user_payable += payableVal;
      groups[periodKey].user_gain += gainVal;
    }
    groups[periodKey].total_payable += payableVal;
    groups[periodKey].total_gain += gainVal;
  });
  
  // Sort period keys descending
  const sortedPeriods = Object.keys(groups).sort().reverse();
  
  let financialRowsHtml = sortedPeriods.map(period => {
    const g = groups[period];
    return `
      <tr>
        <td style="font-weight: 600; color: #fff;">${period}</td>
        <td>
          <span style="color: var(--text-secondary); font-size: 0.85rem;">₹${g.coD_payable.toLocaleString('en-IN')}</span><br>
          <span style="color: var(--secondary); font-weight: 600; font-size: 0.95rem;">₹${g.coD_gain.toLocaleString('en-IN')}</span>
        </td>
        <td>
          <span style="color: var(--text-secondary); font-size: 0.85rem;">₹${g.employee_payable.toLocaleString('en-IN')}</span><br>
          <span style="color: var(--primary); font-weight: 600; font-size: 0.95rem;">₹${g.employee_gain.toLocaleString('en-IN')}</span>
        </td>
        <td>
          <span style="color: var(--text-secondary); font-size: 0.85rem;">₹${g.user_payable.toLocaleString('en-IN')}</span><br>
          <span style="color: var(--text-muted); font-weight: 600; font-size: 0.95rem;">₹${g.user_gain.toLocaleString('en-IN')}</span>
        </td>
        <td>
          <span style="color: #fff; font-size: 0.85rem;">₹${g.total_payable.toLocaleString('en-IN')}</span><br>
          <span style="color: var(--accent); font-weight: 700; font-size: 1rem;">₹${g.total_gain.toLocaleString('en-IN')}</span>
        </td>
      </tr>
    `;
  }).join('');
  
  if (sortedPeriods.length === 0) {
    financialRowsHtml = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No financial transactions recorded.</td></tr>`;
  }

  return `
    <!-- 1. FINANCIAL SUMMARY TABLE (Daily, Monthly, Yearly Basis) -->
    <div class="financial-summary-panel" style="margin-top: 30px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 25px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px;">
        <h3 style="font-family: var(--font-header); font-size: 1.1rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; margin: 0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="9" y2="12"/>
            <line x1="15" y1="16" x2="15" y2="12"/>
          </svg>
          Financial Insights (Total Collections / <span style="color: var(--accent);">Net Company Gain</span>)
        </h3>
        
        <div class="segmented-control" style="max-width: 320px; height: 38px; padding: 2px;">
          <input type="radio" name="finBasis" id="finBasisDaily" value="daily" ${basis === 'daily' ? 'checked' : ''} onchange="changeFinancialBasis('daily')" />
          <label for="finBasisDaily" style="padding: 4px 10px; font-size: 0.8rem; margin-bottom: 0;">Daily</label>
          <input type="radio" name="finBasis" id="finBasisMonthly" value="monthly" ${basis === 'monthly' ? 'checked' : ''} onchange="changeFinancialBasis('monthly')" />
          <label for="finBasisMonthly" style="padding: 4px 10px; font-size: 0.8rem; margin-bottom: 0;">Monthly</label>
          <input type="radio" name="finBasis" id="finBasisYearly" value="yearly" ${basis === 'yearly' ? 'checked' : ''} onchange="changeFinancialBasis('yearly')" />
          <label for="finBasisYearly" style="padding: 4px 10px; font-size: 0.8rem; margin-bottom: 0;">Yearly</label>
        </div>
      </div>
      
      <div class="audit-ledger-container" style="overflow-x: auto; margin-bottom: 30px;">
        <table class="audit-table" style="min-width: 500px;">
          <thead>
            <tr>
              <th>Timeframe (${basis.toUpperCase()})</th>
              <th>Co-Director <div style="font-size: 0.7rem; text-transform: none; font-weight: normal; color: var(--text-muted);">Total / <span style="color: var(--secondary); font-weight: bold;">Gain</span></div></th>
              <th>Employee <div style="font-size: 0.7rem; text-transform: none; font-weight: normal; color: var(--text-muted);">Total / <span style="color: var(--primary); font-weight: bold;">Gain</span></div></th>
              <th>User <div style="font-size: 0.7rem; text-transform: none; font-weight: normal; color: var(--text-muted);">Total / <span style="color: var(--text-muted); font-weight: bold;">Gain</span></div></th>
              <th>Grand Total <div style="font-size: 0.7rem; text-transform: none; font-weight: normal; color: var(--text-muted);">Total / <span style="color: var(--accent); font-weight: bold;">Gain</span></div></th>
            </tr>
          </thead>
          <tbody>
            ${financialRowsHtml}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 2. INDIVIDUAL TRANSACTION LEDGER -->
    <div class="audit-ledger-container" style="margin-top: 15px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 20px;">
      <h3 style="font-family: var(--font-header); font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        Detailed Agreement Ledger
      </h3>
      <table class="audit-table">
        <thead>
          <tr>
            <th>Agreement ID</th>
            <th>Licensor (Owner)</th>
            <th>Licensee (Tenant)</th>
            <th>Type</th>
            <th>Total Payable</th>
            <th>Net Gain</th>
            <th>Date</th>
            <th>Compliance Status</th>
            <th>Supervisory Action</th>
          </tr>
        </thead>
        <tbody>
          ${auditAgreements.map((agreement, idx) => `
            <tr>
              <td style="font-family: monospace; font-weight: 600; color: var(--secondary);">${agreement.id}</td>
              <td>${agreement.licensor}</td>
              <td>${agreement.licensee}</td>
              <td>${agreement.type}</td>
              <td style="font-weight: 600; color: var(--text-secondary);">₹${agreement.payable.toLocaleString('en-IN')}</td>
              <td style="font-weight: 700; color: var(--accent);">₹${(agreement.gain !== undefined ? agreement.gain : (agreement.payable * 0.25)).toLocaleString('en-IN')}</td>
              <td>${agreement.date}</td>
              <td>
                <span class="audit-status-badge ${agreement.status.toLowerCase()}" id="status_badge_${idx}">${agreement.status}</span>
              </td>
              <td>
                <select onchange="updateAuditStatus(${idx}, this.value)" style="padding: 4px 8px;">
                  <option value="Draft" ${agreement.status === 'Draft' ? 'selected' : ''}>Draft</option>
                  <option value="Biometrics" ${agreement.status === 'Biometrics' ? 'selected' : ''}>Biometrics</option>
                  <option value="Stamping" ${agreement.status === 'Stamping' ? 'selected' : ''}>Stamping</option>
                  <option value="Registered" ${agreement.status === 'Registered' ? 'selected' : ''}>Registered</option>
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPortalDashboard(role) {
  const contentArea = document.getElementById("portalRoleDashboardContent");
  if (!contentArea) return;
  
  let html = "";
  
  if (role === "Admin") {
    html = `
      <div class="admin-controls-grid">
        <div class="admin-input-group">
          <label for="admStampRate">Stamp Duty Rate (%)</label>
          <input type="number" id="admStampRate" step="0.01" value="${(customRates.stampDutyRate * 100).toFixed(2)}" />
        </div>
        <div class="admin-input-group">
          <label for="admRegUrban">Urban Registration Fee (₹)</label>
          <input type="number" id="admRegUrban" value="${customRates.regFeeUrban}" />
        </div>
        <div class="admin-input-group">
          <label for="admRegRural">Rural Registration Fee (₹)</label>
          <input type="number" id="admRegRural" value="${customRates.regFeeRural}" />
        </div>
        <div class="admin-input-group">
          <label for="admLegalRes">Legal Residential Charges (₹)</label>
          <input type="number" id="admLegalRes" value="${customRates.legalResidential}" />
        </div>
        <div class="admin-input-group">
          <label for="admLegalCom">Legal Commercial Charges (₹)</label>
          <input type="number" id="admLegalCom" value="${customRates.legalCommercial}" />
        </div>
        <div class="admin-input-group">
          <label for="admVisiting">Visiting & Biometrics (₹)</label>
          <input type="number" id="admVisiting" value="${customRates.visitingCharges}" />
        </div>
        <div class="admin-input-group">
          <label for="admDhc">DHC (₹)</label>
          <input type="number" id="admDhc" value="${customRates.dhc}" />
        </div>
        <div class="admin-input-group">
          <label for="admPolice">Police Verification (₹)</label>
          <input type="number" id="admPolice" value="${customRates.policeCharges}" />
        </div>
        <div class="admin-input-group">
          <label for="admGstRate">GST Rate (%)</label>
          <input type="number" id="admGstRate" value="${customRates.gstRate}" />
        </div>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 15px; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="updateAdminRates()" style="width: auto; padding: 10px 20px; font-size: 0.8rem; height: 40px;">
          Update Configuration Rates
        </button>
        <button class="btn btn-secondary" onclick="resetAdminRates()" style="width: auto; padding: 10px 20px; font-size: 0.8rem; height: 40px;">
          Reset Defaults
        </button>
      </div>
      ${getLedgerHtml()}
    `;
  } else if (role === "MD") {
    html = `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Stamp Duty Rate</div>
          <div class="metric-value">${(customRates.stampDutyRate * 100).toFixed(2)}%</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Urban Reg Fee</div>
          <div class="metric-value">₹${customRates.regFeeUrban}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Rural Reg Fee</div>
          <div class="metric-value">₹${customRates.regFeeRural}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Active MD Override</div>
          <div class="metric-value" style="color: var(--warning);">${customDiscount.type === 'None' ? 'None' : (customDiscount.type === 'Flat' ? '₹' + customDiscount.value : customDiscount.value + '%')}</div>
        </div>
      </div>
      <div class="config-card" style="margin-top: 15px;">
        <div style="font-family: var(--font-header); font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
            <path d="M12 2L2 22h20L12 2z"/>
          </svg>
          MD Privilege Discount Controller
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label>Discount Paradigm</label>
          <div class="segmented-control" style="max-width: 450px;">
            <input type="radio" name="mdDiscType" id="mdDiscNone" value="None" ${customDiscount.type === 'None' ? 'checked' : ''} onchange="updateMDDiscount()" />
            <label for="mdDiscNone" style="margin-bottom: 0;">No Discount</label>
            <input type="radio" name="mdDiscType" id="mdDiscFlat" value="Flat" ${customDiscount.type === 'Flat' ? 'checked' : ''} onchange="updateMDDiscount()" />
            <label for="mdDiscFlat" style="margin-bottom: 0;">Flat Override (₹)</label>
            <input type="radio" name="mdDiscType" id="mdDiscPct" value="Percentage" ${customDiscount.type === 'Percentage' ? 'checked' : ''} onchange="updateMDDiscount()" />
            <label for="mdDiscPct" style="margin-bottom: 0;">Percentage Override (%)</label>
          </div>
        </div>
        <div class="form-group" id="mdDiscountValueGroup" style="display: ${customDiscount.type === 'None' ? 'none' : 'flex'}; flex-direction: column; max-width: 450px; animation: fadeIn 0.3s ease;">
          <label id="mdDiscountValueLabel">${customDiscount.type === 'Flat' ? 'Discount Value (₹)' : 'Discount Percentage (%)'}</label>
          <div class="input-wrapper">
            <span class="input-icon" id="mdDiscountValueIcon" style="font-weight: 600; color: var(--warning);">${customDiscount.type === 'Flat' ? '₹' : '%'}</span>
            <input type="number" id="mdDiscountValue" value="${customDiscount.value}" min="0" oninput="updateMDDiscount()" />
          </div>
        </div>
      </div>
      ${getLedgerHtml()}
    `;
  } else if (role === "Director") {
    html = `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Compliance Agreements</div>
          <div class="metric-value">${auditAgreements.length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Registered Status</div>
          <div class="metric-value" style="color: var(--accent);">${auditAgreements.filter(a => a.status === 'Registered').length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Stamping Pending</div>
          <div class="metric-value" style="color: var(--warning);">${auditAgreements.filter(a => a.status === 'Stamping').length}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Biometrics Processing</div>
          <div class="metric-value" style="color: var(--primary);">${auditAgreements.filter(a => a.status === 'Biometrics').length}</div>
        </div>
      </div>
      ${getLedgerHtml()}
    `;
  } else {
    html = `
      <div class="info-box" style="background-color: rgba(255, 255, 255, 0.02); border-color: var(--border-color); color: var(--text-secondary);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-top: 2px;">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div>
          <strong>Role Clearance Level:</strong> You are currently authenticated with the <strong>User</strong> sandbox role. Administrative control widgets, privilege overrides, and audit logs are restricted at this level.
        </div>
      </div>
    `;
  }
  
  contentArea.innerHTML = html;
}
