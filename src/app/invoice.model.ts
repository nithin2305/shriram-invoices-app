export interface LrRow {
  lrNo: string;
  date: string;          // dd.mm.yyyy
  from: string;
  to: string;
  description: string;
  pkgs: string;          // e.g. "ROLL\n12" — newline allowed
}

export interface CompanyDetails {
  name: string;
  address: string;
  contact: string;
  email: string;
  state: string;
  gstin: string;
  pan: string;
  bankName: string;
  accountNo: string;
  branch: string;
  ifsc: string;
  jurisdiction: string;
}

export interface CustomerDetails {
  name: string;
  addressLine1: string;
  addressLine2: string;
  gstNo: string;
}

export interface Vehicle {
  vehicleNo: string;
  vehicleType: string;
}

export interface Charge {
  label: string;
  amount: number;
}

export interface Invoice {
  company: CompanyDetails;
  customer: CustomerDetails;
  invoiceNo: string;
  date: string;          // dd.mm.yyyy
  vehicles: Vehicle[];
  charges: Charge[];     // charges[0] is the main line (e.g. Transportation Charges)
  lrRows: LrRow[];
  gstNote: string;
  amountInWords: string; // auto-generated, editable
}

export const DEFAULT_COMPANY: CompanyDetails = {
  name: 'SHRIRAM LOGISTICS',
  address: 'No. 66/1, Mettu Street, Kaladipet Chennai- 600 019',
  contact: '+91 9380677514',
  email: 'shriramlogics@gmail.com',
  state: 'TamilNadu',
  gstin: '33AJBPM6638G1ZA',
  pan: 'AJBPM6638G',
  bankName: 'CANARA BANK',
  accountNo: '60151400000726',
  branch: 'Mylapore Branch',
  ifsc: 'CNRB0016015',
  jurisdiction: 'CHENNAI'
};

export const DEFAULT_GST_NOTE = 'GST TO BE PAID BY THE SERVICE RECEIPIENT';

export function invoiceTotal(inv: Invoice): number {
  return inv.charges.reduce((a, ch) => a + (Number(ch.amount) || 0), 0);
}

export function formatAmount(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
