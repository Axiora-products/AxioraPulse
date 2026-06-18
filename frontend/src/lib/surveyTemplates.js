/* ─────────────────────────────────────────────────────────────────
   Featured survey templates shown on the Pulse landing page.

   Each template ships with 12+ ready-to-use questions so a visitor can
   preview the full instrument before signing up, then load it straight
   into the builder. Question shapes match what SurveyCreate.loadTemplate
   expects: { question_text, question_type, is_required, description?, options? }.

   Derived metadata (question count + estimated completion time) is
   computed once at module load from the question list, so the cards
   never drift out of sync with the actual questions.
───────────────────────────────────────────────────────────────── */
import { estimateSurveyMinutes } from './constants';

// Build { label, value } option objects from plain labels.
const opt = (...labels) =>
  labels.map(l => ({
    label: l,
    value: String(l).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  }));

const RAW_TEMPLATES = [
  // ── 1. Customer Satisfaction (CSAT) ────────────────────────────────
  {
    name: 'Customer Satisfaction Survey',
    category: 'Customer Experience',
    desc: 'Measure customer satisfaction, support quality, and key areas for service improvement.',
    questions: [
      { question_text: 'Overall, how satisfied are you with your experience?', question_type: 'scale', is_required: true, description: '1 = Very dissatisfied · 10 = Extremely satisfied' },
      { question_text: 'How would you rate the quality of our service?', question_type: 'rating', is_required: true },
      { question_text: 'Did our support team resolve your issue or answer your questions?', question_type: 'yes_no', is_required: true },
      { question_text: 'How responsive was our team to your inquiry?', question_type: 'single_choice', is_required: false, options: opt('Extremely responsive', 'Somewhat responsive', 'Neutral', 'Not very responsive', 'Not at all responsive') },
      { question_text: 'Which aspect of your experience was most satisfying?', question_type: 'multiple_choice', is_required: false, options: opt('Product quality', 'Customer support', 'Ease of use', 'Delivery speed', 'Pricing') },
      { question_text: 'What could we have done to improve your experience?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 2. Product Feedback ───────────────────────────────────────────
  {
    name: 'Product Feedback Survey',
    category: 'Product Management',
    desc: 'Gather actionable feedback on product usage, usability, bugs, and feature requests.',
    questions: [
      { question_text: 'How long have you been using our product?', question_type: 'single_choice', is_required: true, options: opt('Less than a month', '1 to 6 months', '6 to 12 months', '1 to 3 years', 'More than 3 years') },
      { question_text: 'How frequently do you use the product?', question_type: 'single_choice', is_required: true, options: opt('Daily', 'Weekly', 'Monthly', 'Rarely') },
      { question_text: 'How would you rate the product’s ease of use?', question_type: 'rating', is_required: true },
      { question_text: 'What is your favorite feature of the product?', question_type: 'short_text', is_required: false },
      { question_text: 'Have you encountered any issues or bugs?', question_type: 'yes_no', is_required: true },
      { question_text: 'If yes, please describe the issues you encountered.', question_type: 'long_text', is_required: false },
      { question_text: 'How likely are you to recommend our product to a colleague?', question_type: 'scale', is_required: false, description: '0 = Not at all likely · 10 = Extremely likely' },
    ],
  },

  // ── 3. Employee Engagement ────────────────────────────────────────
  {
    name: 'Employee Engagement Survey',
    category: 'Human Resources',
    desc: 'Evaluate workplace culture, tools, recognition, and alignment with company goals.',
    questions: [
      { question_text: 'How happy are you working at our company?', question_type: 'emoji_reaction', is_required: true },
      { question_text: 'How valued do you feel by your team and manager?', question_type: 'scale', is_required: true, description: '1 = Not valued at all · 10 = Highly valued' },
      { question_text: 'Do you have the tools and resources you need to do your job effectively?', question_type: 'yes_no', is_required: true },
      { question_text: 'How would you rate the communication within the company?', question_type: 'rating', is_required: true },
      { question_text: 'Which areas do you feel the company could improve?', question_type: 'multiple_choice', is_required: false, options: opt('Work-life balance', 'Professional growth', 'Compensation', 'Company culture', 'Tools & equipment') },
      { question_text: 'What is the best part of working here?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 4. Manufacturing Safety ──────────────────────────────────────
  {
    name: 'Manufacturing Safety Survey',
    category: 'Manufacturing',
    desc: 'Assess shop-floor safety culture, hazard awareness, and PPE compliance across your plant.',
    questions: [
      { question_text: 'Which department do you primarily work in?', question_type: 'dropdown', is_required: true, options: opt('Assembly', 'Fabrication', 'Welding', 'Packaging', 'Maintenance', 'Quality Control') },
      { question_text: 'How safe do you feel in your current work environment?', question_type: 'scale', is_required: true, description: '1 = Very unsafe · 10 = Completely safe' },
      { question_text: 'How often do you receive safety briefings before a shift?', question_type: 'single_choice', is_required: true, options: opt('Every shift', 'Weekly', 'Monthly', 'Rarely', 'Never') },
      { question_text: 'Which personal protective equipment do you use regularly?', question_type: 'multiple_choice', is_required: true, options: opt('Hard hat', 'Safety glasses', 'Ear protection', 'Gloves', 'Steel-toe boots', 'Respirator') },
      { question_text: 'Have you witnessed a safety incident in the last 6 months?', question_type: 'yes_no', is_required: true },
      { question_text: 'How would you rate the availability of safety equipment?', question_type: 'rating', is_required: true },
      { question_text: 'How confident are you in using emergency stop controls?', question_type: 'scale', is_required: false, description: '1 = Not confident · 10 = Very confident' },
      { question_text: 'Rank these hazards by how concerning they are on your line.', question_type: 'ranking', is_required: false, options: opt('Moving machinery', 'Slips & falls', 'Chemical exposure', 'Noise', 'Heat / fire') },
      { question_text: 'How quickly are reported hazards typically addressed?', question_type: 'single_choice', is_required: false, options: opt('Same day', 'Within a week', 'Within a month', 'Longer than a month', 'Not addressed') },
      { question_text: 'How comfortable are you reporting a safety concern to your supervisor?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Describe any near-miss incidents you have experienced recently.', question_type: 'long_text', is_required: false },
      { question_text: 'What single change would most improve safety at your facility?', question_type: 'long_text', is_required: false },
      { question_text: 'Date of your most recent safety training.', question_type: 'date', is_required: false },
    ],
  },

  // ── 2. Machine Maintenance ───────────────────────────────────────
  {
    name: 'Machine Maintenance Survey',
    category: 'Maintenance',
    desc: 'Track equipment reliability, downtime causes, and preventive-maintenance effectiveness.',
    questions: [
      { question_text: 'Which equipment category do you primarily maintain?', question_type: 'dropdown', is_required: true, options: opt('CNC machines', 'Conveyors', 'Hydraulics', 'Robotics', 'HVAC', 'Electrical systems') },
      { question_text: 'How would you rate the overall reliability of your machines?', question_type: 'rating', is_required: true },
      { question_text: 'How often does unplanned downtime occur on your line?', question_type: 'single_choice', is_required: true, options: opt('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Rarely') },
      { question_text: 'What are the most common causes of breakdowns?', question_type: 'multiple_choice', is_required: true, options: opt('Wear & tear', 'Operator error', 'Lack of lubrication', 'Electrical faults', 'Software issues', 'Aging equipment') },
      { question_text: 'Is preventive maintenance scheduled regularly?', question_type: 'yes_no', is_required: true },
      { question_text: 'How effective is the current preventive-maintenance program?', question_type: 'scale', is_required: true, description: '1 = Ineffective · 10 = Highly effective' },
      { question_text: 'Average hours to resolve a typical breakdown.', question_type: 'number', is_required: false, description: 'Enter a whole number of hours' },
      { question_text: 'How adequate is the spare-parts inventory?', question_type: 'scale', is_required: false, description: '1 = Always short · 10 = Always available' },
      { question_text: 'Rank these factors by their impact on downtime.', question_type: 'ranking', is_required: false, options: opt('Parts availability', 'Technician skill', 'Diagnostic tools', 'Machine age', 'Vendor support') },
      { question_text: 'How satisfied are you with the maintenance management system?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Are maintenance logs kept up to date?', question_type: 'single_choice', is_required: false, options: opt('Always', 'Usually', 'Sometimes', 'Rarely', 'Never') },
      { question_text: 'Describe the most recurring maintenance issue you face.', question_type: 'long_text', is_required: false },
      { question_text: 'What tools or training would improve your maintenance work?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 3. Production Quality ────────────────────────────────────────
  {
    name: 'Production Quality Survey',
    category: 'Quality',
    desc: 'Measure defect rates, process consistency, and quality-control confidence on the line.',
    questions: [
      { question_text: 'Which production stage are you evaluating?', question_type: 'dropdown', is_required: true, options: opt('Raw material intake', 'In-process', 'Final assembly', 'Packaging', 'Dispatch') },
      { question_text: 'How would you rate overall product quality?', question_type: 'rating', is_required: true },
      { question_text: 'How frequently do defects occur in your process?', question_type: 'single_choice', is_required: true, options: opt('Very frequently', 'Frequently', 'Occasionally', 'Rarely', 'Almost never') },
      { question_text: 'Which defect types are most common?', question_type: 'multiple_choice', is_required: true, options: opt('Dimensional', 'Surface finish', 'Assembly', 'Material', 'Labeling', 'Functional') },
      { question_text: 'Are quality standards clearly documented and accessible?', question_type: 'yes_no', is_required: true },
      { question_text: 'How consistent is output quality across shifts?', question_type: 'scale', is_required: true, description: '1 = Very inconsistent · 10 = Very consistent' },
      { question_text: 'Estimated defect rate this month (%).', question_type: 'slider', is_required: false, description: '0% to 100%' },
      { question_text: 'How effective are current inspection methods?', question_type: 'scale', is_required: false, description: '1 = Ineffective · 10 = Highly effective' },
      { question_text: 'Rank these root causes of defects by frequency.', question_type: 'ranking', is_required: false, options: opt('Material quality', 'Machine calibration', 'Operator training', 'Process design', 'Environmental factors') },
      { question_text: 'How confident are you in the final QC sign-off process?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'How often is corrective action taken after a defect is found?', question_type: 'single_choice', is_required: false, options: opt('Always', 'Usually', 'Sometimes', 'Rarely', 'Never') },
      { question_text: 'Describe a recurring quality issue and its suspected cause.', question_type: 'long_text', is_required: false },
      { question_text: 'What would most improve quality on your line?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 4. Warehouse Operations ──────────────────────────────────────
  {
    name: 'Warehouse Operations Survey',
    category: 'Logistics',
    desc: 'Evaluate picking accuracy, space utilisation, and workflow efficiency in your warehouse.',
    questions: [
      { question_text: 'Which warehouse function is your primary role?', question_type: 'dropdown', is_required: true, options: opt('Receiving', 'Put-away', 'Picking', 'Packing', 'Shipping', 'Inventory') },
      { question_text: 'How would you rate overall warehouse efficiency?', question_type: 'rating', is_required: true },
      { question_text: 'How accurate is order picking on a typical day?', question_type: 'scale', is_required: true, description: '1 = Many errors · 10 = Near perfect' },
      { question_text: 'Which factors most slow down your workflow?', question_type: 'multiple_choice', is_required: true, options: opt('Disorganised layout', 'Equipment shortage', 'System lag', 'Understaffing', 'Poor signage', 'Congestion') },
      { question_text: 'Is the warehouse layout optimised for fast movement?', question_type: 'yes_no', is_required: true },
      { question_text: 'How well is storage space utilised?', question_type: 'scale', is_required: true, description: '1 = Poorly · 10 = Excellently' },
      { question_text: 'Average orders processed per shift.', question_type: 'number', is_required: false },
      { question_text: 'How reliable is the warehouse management system (WMS)?', question_type: 'rating', is_required: false },
      { question_text: 'Rank these areas by need for improvement.', question_type: 'ranking', is_required: false, options: opt('Receiving', 'Storage', 'Picking', 'Packing', 'Dispatch') },
      { question_text: 'How safe do you feel operating material-handling equipment?', question_type: 'scale', is_required: false, description: '1 = Unsafe · 10 = Very safe' },
      { question_text: 'How satisfied are you with current shift scheduling?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Describe the biggest bottleneck in your daily operations.', question_type: 'long_text', is_required: false },
      { question_text: 'What change would most improve warehouse throughput?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 5. Industrial Automation ─────────────────────────────────────
  {
    name: 'Industrial Automation Survey',
    category: 'Automation',
    desc: 'Gauge automation adoption, system reliability, and workforce readiness for smart factories.',
    questions: [
      { question_text: 'What is your role relative to automation systems?', question_type: 'dropdown', is_required: true, options: opt('Operator', 'Technician', 'Engineer', 'Supervisor', 'Manager') },
      { question_text: 'How automated is your production line today?', question_type: 'scale', is_required: true, description: '1 = Fully manual · 10 = Fully automated' },
      { question_text: 'How reliable are your automated systems?', question_type: 'rating', is_required: true },
      { question_text: 'Which automation technologies are in use at your facility?', question_type: 'multiple_choice', is_required: true, options: opt('PLCs', 'Industrial robots', 'SCADA', 'IoT sensors', 'Vision systems', 'AGVs') },
      { question_text: 'Has automation improved your productivity?', question_type: 'yes_no', is_required: true },
      { question_text: 'How confident are you operating the automated equipment?', question_type: 'scale', is_required: true, description: '1 = Not confident · 10 = Very confident' },
      { question_text: 'How well integrated are your systems and data?', question_type: 'rating', is_required: false },
      { question_text: 'Rank the biggest barriers to further automation.', question_type: 'ranking', is_required: false, options: opt('Cost', 'Skills gap', 'Legacy equipment', 'Integration complexity', 'Cybersecurity') },
      { question_text: 'How adequate is the training provided for new automation tools?', question_type: 'scale', is_required: false, description: '1 = Inadequate · 10 = Excellent' },
      { question_text: 'How frequently do automated systems require manual intervention?', question_type: 'single_choice', is_required: false, options: opt('Constantly', 'Often', 'Occasionally', 'Rarely', 'Never') },
      { question_text: 'How do you feel about automation in your role?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Which process would benefit most from automation next?', question_type: 'long_text', is_required: false },
      { question_text: 'Describe any challenges you face with current automation.', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 6. Worker Training ───────────────────────────────────────────
  {
    name: 'Worker Training Survey',
    category: 'Training',
    desc: 'Understand training effectiveness, skill gaps, and development needs across your workforce.',
    questions: [
      { question_text: 'How long have you worked at this facility?', question_type: 'single_choice', is_required: true, options: opt('Less than 6 months', '6–12 months', '1–3 years', '3–5 years', 'More than 5 years') },
      { question_text: 'How would you rate the onboarding training you received?', question_type: 'rating', is_required: true },
      { question_text: 'How relevant is the training content to your daily work?', question_type: 'scale', is_required: true, description: '1 = Not relevant · 10 = Highly relevant' },
      { question_text: 'Which training formats do you find most effective?', question_type: 'multiple_choice', is_required: true, options: opt('Hands-on practice', 'Classroom', 'Online modules', 'Mentorship', 'Video', 'Job shadowing') },
      { question_text: 'Do you feel adequately trained for your current responsibilities?', question_type: 'yes_no', is_required: true },
      { question_text: 'How confident are you applying what you learned?', question_type: 'scale', is_required: true, description: '1 = Not confident · 10 = Very confident' },
      { question_text: 'How frequently do you receive refresher training?', question_type: 'single_choice', is_required: false, options: opt('Monthly', 'Quarterly', 'Annually', 'Rarely', 'Never') },
      { question_text: 'Rank these skill areas by where you most need development.', question_type: 'ranking', is_required: false, options: opt('Technical skills', 'Safety procedures', 'Quality standards', 'New technology', 'Soft skills') },
      { question_text: 'How accessible are training resources when you need them?', question_type: 'rating', is_required: false },
      { question_text: 'How satisfied are you with the trainers and instructors?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'How likely are you to recommend the training program to a colleague?', question_type: 'scale', is_required: false, description: '0 = Not at all likely · 10 = Extremely likely' },
      { question_text: 'What additional training would help you do your job better?', question_type: 'long_text', is_required: false },
      { question_text: 'Describe any gaps between your training and real on-the-job needs.', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 7. Emergency Preparedness ────────────────────────────────────
  {
    name: 'Emergency Preparedness Survey',
    category: 'Safety',
    desc: 'Test readiness for fire, evacuation, and medical emergencies across your site.',
    questions: [
      { question_text: 'Which site or building are you assessing?', question_type: 'dropdown', is_required: true, options: opt('Main plant', 'Warehouse', 'Office block', 'Loading dock', 'Utility area') },
      { question_text: 'Do you know the location of the nearest emergency exit?', question_type: 'yes_no', is_required: true },
      { question_text: 'How prepared do you feel for an on-site emergency?', question_type: 'scale', is_required: true, description: '1 = Not prepared · 10 = Fully prepared' },
      { question_text: 'Which emergency drills have you participated in?', question_type: 'multiple_choice', is_required: true, options: opt('Fire evacuation', 'Chemical spill', 'Earthquake', 'Medical emergency', 'Lockdown', 'None') },
      { question_text: 'How often are emergency drills conducted?', question_type: 'single_choice', is_required: true, options: opt('Monthly', 'Quarterly', 'Twice a year', 'Annually', 'Never') },
      { question_text: 'How would you rate the clarity of evacuation signage?', question_type: 'rating', is_required: true },
      { question_text: 'Do you know who your designated emergency wardens are?', question_type: 'yes_no', is_required: false },
      { question_text: 'How confident are you in using a fire extinguisher?', question_type: 'scale', is_required: false, description: '1 = Not confident · 10 = Very confident' },
      { question_text: 'Rank these emergency risks by likelihood at your site.', question_type: 'ranking', is_required: false, options: opt('Fire', 'Chemical exposure', 'Equipment failure', 'Medical incident', 'Natural disaster') },
      { question_text: 'How accessible is first-aid equipment in your area?', question_type: 'scale', is_required: false, description: '1 = Hard to reach · 10 = Always within reach' },
      { question_text: 'How would you rate the speed of past emergency responses?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Describe any gaps you have noticed in emergency procedures.', question_type: 'long_text', is_required: false },
      { question_text: 'What would help you respond more effectively in an emergency?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 8. Inventory Control ─────────────────────────────────────────
  {
    name: 'Inventory Control Survey',
    category: 'Supply Chain',
    desc: 'Assess stock accuracy, replenishment timing, and inventory-system reliability.',
    questions: [
      { question_text: 'Which inventory area do you manage?', question_type: 'dropdown', is_required: true, options: opt('Raw materials', 'Work-in-progress', 'Finished goods', 'Spare parts', 'Consumables') },
      { question_text: 'How accurate is your current inventory data?', question_type: 'scale', is_required: true, description: '1 = Very inaccurate · 10 = Highly accurate' },
      { question_text: 'How often do stockouts occur?', question_type: 'single_choice', is_required: true, options: opt('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Rarely') },
      { question_text: 'Which inventory problems do you encounter most?', question_type: 'multiple_choice', is_required: true, options: opt('Stockouts', 'Overstock', 'Misplaced items', 'Data mismatch', 'Expired stock', 'Shrinkage') },
      { question_text: 'Do you use a digital inventory management system?', question_type: 'yes_no', is_required: true },
      { question_text: 'How reliable is your inventory system?', question_type: 'rating', is_required: true },
      { question_text: 'How frequently are physical stock counts performed?', question_type: 'single_choice', is_required: false, options: opt('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually') },
      { question_text: 'Estimated stock accuracy at last audit (%).', question_type: 'slider', is_required: false, description: '0% to 100%' },
      { question_text: 'Rank these causes of inventory discrepancies.', question_type: 'ranking', is_required: false, options: opt('Manual entry errors', 'Theft / loss', 'Receiving errors', 'System sync issues', 'Mislabeling') },
      { question_text: 'How timely is stock replenishment?', question_type: 'scale', is_required: false, description: '1 = Always late · 10 = Always on time' },
      { question_text: 'How satisfied are you with current reorder processes?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Describe the biggest challenge in keeping inventory accurate.', question_type: 'long_text', is_required: false },
      { question_text: 'What improvement would most reduce inventory errors?', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 9. Vendor Quality Assessment ─────────────────────────────────
  {
    name: 'Vendor Quality Assessment Survey',
    category: 'Procurement',
    desc: 'Rate supplier reliability, material quality, and delivery performance to inform sourcing.',
    questions: [
      { question_text: 'Name of the vendor being assessed.', question_type: 'short_text', is_required: true },
      { question_text: 'Which category does this vendor supply?', question_type: 'dropdown', is_required: true, options: opt('Raw materials', 'Components', 'Packaging', 'Equipment', 'Services', 'Logistics') },
      { question_text: 'How would you rate the overall quality of supplied materials?', question_type: 'rating', is_required: true },
      { question_text: 'How consistent is the vendor in meeting specifications?', question_type: 'scale', is_required: true, description: '1 = Very inconsistent · 10 = Always meets spec' },
      { question_text: 'How reliable is the vendor on delivery timelines?', question_type: 'scale', is_required: true, description: '1 = Often late · 10 = Always on time' },
      { question_text: 'Which issues have you experienced with this vendor?', question_type: 'multiple_choice', is_required: false, options: opt('Late deliveries', 'Quality defects', 'Incorrect quantities', 'Poor communication', 'Pricing disputes', 'None') },
      { question_text: 'Does the vendor hold relevant quality certifications?', question_type: 'yes_no', is_required: true },
      { question_text: 'How responsive is the vendor to issues and complaints?', question_type: 'rating', is_required: false },
      { question_text: 'Rank these vendor attributes by importance to you.', question_type: 'ranking', is_required: false, options: opt('Quality', 'Price', 'Delivery speed', 'Communication', 'Flexibility') },
      { question_text: 'How competitive is the vendor on pricing?', question_type: 'scale', is_required: false, description: '1 = Expensive · 10 = Very competitive' },
      { question_text: 'How satisfied are you overall with this vendor?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Would you recommend continuing with this vendor?', question_type: 'single_choice', is_required: true, options: opt('Strongly recommend', 'Recommend', 'Neutral', 'Do not recommend', 'Terminate') },
      { question_text: 'Provide any additional comments on this vendor’s performance.', question_type: 'long_text', is_required: false },
    ],
  },

  // ── 10. Energy Efficiency ────────────────────────────────────────
  {
    name: 'Energy Efficiency Survey',
    category: 'Sustainability',
    desc: 'Identify energy-saving opportunities and gauge awareness of efficiency practices on-site.',
    questions: [
      { question_text: 'Which area of the facility are you evaluating?', question_type: 'dropdown', is_required: true, options: opt('Production floor', 'Lighting', 'HVAC', 'Compressed air', 'Boilers', 'Office areas') },
      { question_text: 'How would you rate your facility’s overall energy efficiency?', question_type: 'rating', is_required: true },
      { question_text: 'How aware are staff of energy-saving practices?', question_type: 'scale', is_required: true, description: '1 = Not aware · 10 = Highly aware' },
      { question_text: 'Which energy-saving measures are currently in place?', question_type: 'multiple_choice', is_required: true, options: opt('LED lighting', 'Motion sensors', 'Variable-speed drives', 'Solar power', 'Heat recovery', 'Smart metering') },
      { question_text: 'Is energy consumption actively monitored?', question_type: 'yes_no', is_required: true },
      { question_text: 'How significant is energy cost as a share of operating expense?', question_type: 'scale', is_required: false, description: '1 = Minor · 10 = Major' },
      { question_text: 'Where do you see the most energy waste?', question_type: 'single_choice', is_required: false, options: opt('Idle equipment', 'Lighting', 'Heating / cooling', 'Compressed air leaks', 'Standby loads') },
      { question_text: 'Rank these initiatives by potential energy savings.', question_type: 'ranking', is_required: false, options: opt('Equipment upgrades', 'Behavioral change', 'Renewable energy', 'Process optimisation', 'Insulation') },
      { question_text: 'How supportive is leadership of energy-efficiency investments?', question_type: 'scale', is_required: false, description: '1 = Unsupportive · 10 = Very supportive' },
      { question_text: 'Estimated potential energy reduction achievable (%).', question_type: 'slider', is_required: false, description: '0% to 100%' },
      { question_text: 'How motivated are you to contribute to energy savings?', question_type: 'emoji_reaction', is_required: false },
      { question_text: 'Describe the biggest barrier to improving energy efficiency here.', question_type: 'long_text', is_required: false },
      { question_text: 'What is one energy-saving idea you would like to see implemented?', question_type: 'long_text', is_required: false },
    ],
  },
];

// Decorate each template with a stable id + derived metadata.
export const SURVEY_TEMPLATES = RAW_TEMPLATES.map((t, i) => ({
  ...t,
  id: t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  questionCount: t.questions.length,
  estMinutes: estimateSurveyMinutes(t.questions),
  // pre-built color accent index for card variety
  accentIndex: i % 4,
}));

/** Shape consumed by SurveyCreate.loadTemplate ({ name, qs }). */
export function toBuilderTemplate(template) {
  return {
    name: template.name,
    qs: template.questions.map(q => ({
      question_text: q.question_text,
      question_type: q.question_type,
      is_required: !!q.is_required,
      description: q.description || '',
      options: q.options || [],
    })),
  };
}
