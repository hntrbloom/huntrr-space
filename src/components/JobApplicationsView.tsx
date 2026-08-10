import { safeGetDoc as getDoc, safeGetDocs as getDocs } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Trash2, Edit2, ExternalLink, Calendar as CalendarIcon, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { SyncStatus } from './SyncStatus';
import { format, parseISO } from 'date-fns';
import { JobImportSection } from './JobImportSection';
import { GUEST_SAMPLE_JOB_APPLICATIONS } from '../lib/guestSampleData';

export interface JobApplication {
  id: string;
  company: string;
  position: string;
  status: 'Applied' | 'Interview' | 'Offer' | 'Rejected' | 'Draft';
  dateApplied: string;
  link: string;
  notes: string;
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryPeriod?: string;
  datePosted?: string;
  applicationDeadline?: string;
  shortSummary?: string;
  responsibilities?: string[];
  requiredQualifications?: string[];
  preferredQualifications?: string[];
  source?: string;
  originalUrl?: string;
  jobId?: string;
}

const emptyForm: Partial<JobApplication> = {
  company: '',
  position: '',
  status: 'Draft',
  dateApplied: format(new Date(), 'yyyy-MM-dd'),
  link: '',
  notes: '',
  location: '',
  workplaceType: '',
  employmentType: '',
  salaryMin: '',
  salaryMax: '',
  salaryPeriod: '',
  datePosted: '',
  applicationDeadline: '',
  shortSummary: '',
  responsibilities: [],
  requiredQualifications: [],
  preferredQualifications: [],
  source: '',
  originalUrl: '',
  jobId: ''
};

export function JobApplicationsView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Duplicate check state
  const [duplicateWarning, setDuplicateWarning] = useState<JobApplication | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<JobApplication>>(emptyForm);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.isAnonymous) {
      setApplications(GUEST_SAMPLE_JOB_APPLICATIONS.map(j => ({
        id: j.id,
        company: j.companyName,
        position: j.roleTitle,
        status: j.status === 'Interviewing' ? 'Interview' : (j.status as any),
        dateApplied: j.appliedDate,
        link: j.jobUrl,
        notes: j.notes,
        location: j.location,
        salaryMin: '75000',
        salaryMax: '90000',
        salaryPeriod: 'Yearly'
      })));
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(doc(db, `users/${user.uid}/preferences`, 'jobApplicationsData'), (docSnap) => {
      if (docSnap.exists()) {
        setApplications(docSnap.data().applications || []);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const saveApplications = async (newApps: JobApplication[]) => {
    if (!user) return;
    if (user.isAnonymous) {
      setApplications(newApps);
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 1500);
      return;
    }
    setSyncStatus('saving');
    try {
      const docRef = doc(db, `users/${user.uid}/preferences`, 'jobApplicationsData');
      await setDoc(docRef, { applications: newApps }, { merge: true });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error('Error saving job applications:', e);
      setSyncStatus('error');
    }
  };

  const handleImportSuccess = (jobData: any) => {
    setFormData({
      ...emptyForm,
      company: jobData.companyName || jobData.company || '',
      position: jobData.jobTitle || jobData.position || '',
      location: jobData.location || '',
      workplaceType: jobData.workplaceType || '',
      employmentType: jobData.employmentType || '',
      salaryMin: jobData.salaryMin || '',
      salaryMax: jobData.salaryMax || '',
      salaryPeriod: jobData.salaryPeriod || '',
      datePosted: jobData.datePosted || '',
      applicationDeadline: jobData.applicationDeadline || '',
      shortSummary: jobData.shortSummary || '',
      responsibilities: jobData.responsibilities || [],
      requiredQualifications: jobData.requiredQualifications || [],
      preferredQualifications: jobData.preferredQualifications || [],
      source: jobData.source || '',
      originalUrl: jobData.originalUrl || '',
      link: jobData.originalUrl || '',
      jobId: jobData.jobId || '',
      status: 'Draft',
      dateApplied: format(new Date(), 'yyyy-MM-dd'),
    });
    setIsAdding(true);
    setEditingId(null);
    setDuplicateWarning(null);
  };

  const normalizeUrl = (url: string) => {
    try {
      return new URL(url).origin + new URL(url).pathname.replace(/\/$/, '').toLowerCase();
    } catch (e) {
      return url.split('?')[0].replace(/\/$/, '').toLowerCase();
    }
  };

  const checkForDuplicate = (): JobApplication | null => {
    for (const app of applications) {
      if (app.id === editingId) continue;
      
      if (formData.jobId && app.jobId === formData.jobId) return app;
      
      if (formData.originalUrl && app.originalUrl && normalizeUrl(formData.originalUrl) === normalizeUrl(app.originalUrl)) return app;
      if (formData.link && app.link && normalizeUrl(formData.link) === normalizeUrl(app.link)) return app;
      
      if (formData.company && formData.position && 
          formData.company.toLowerCase() === app.company?.toLowerCase() && 
          formData.position.toLowerCase() === app.position?.toLowerCase()) {
        return app;
      }
    }
    return null;
  };

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const performSave = async (forceNew: boolean = false) => {
    if (!formData.company?.trim() || !formData.position?.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (editingId && !forceNew) {
        const updated = applications.map(app => app.id === editingId ? { ...app, ...formData } as JobApplication : app);
        setApplications(updated);
        await saveApplications(updated);
      } else {
        const newApp: JobApplication = {
          ...formData,
          id: Date.now().toString(),
        } as JobApplication;
        const updated = [newApp, ...applications];
        setApplications(updated);
        await saveApplications(updated);
      }
      setSaveSuccess(true);
      setTimeout(() => {
        resetForm();
        setIsAdding(false);
        setIsSaving(false);
        setSaveSuccess(false);
      }, 1000);
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save application');
      setIsSaving(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const duplicate = checkForDuplicate();
    
    if (duplicate) {
      setDuplicateWarning(duplicate);
    } else {
      performSave();
    }
  };

  const startEditing = (app: JobApplication) => {
    setFormData({ ...emptyForm, ...app });
    setEditingId(app.id);
    setIsAdding(true);
    setDuplicateWarning(null);
  };

  const deleteApplication = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this application?')) return;
    const updated = applications.filter(a => a.id !== id);
    setApplications(updated);
    saveApplications(updated);
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setDuplicateWarning(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Applied': return <CheckCircle2 className="w-4 h-4" />;
      case 'Interview': return <Clock className="w-4 h-4" />;
      case 'Offer': return <Briefcase className="w-4 h-4" />;
      case 'Rejected': return <XCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Applied': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Interview': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Offer': return 'bg-green-100 text-green-800 border-green-200';
      case 'Rejected': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const updateForm = (key: keyof JobApplication, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop pb-safe-nav relative">
      <div className="md:hidden mt-4 mb-8 flex justify-between items-center">
        <h2 className="text-[32px] leading-[1.2] font-bold font-headline-lg-mobile text-on-surface m-0">Jobs</h2>
        <SyncStatus status={syncStatus} />
      </div>
      <div className="hidden md:flex mt-8 mb-8 justify-between items-end">
        <h2 className="text-[40px] leading-[1.2] font-bold font-headline-lg text-on-surface m-0 tracking-tight">Job Applications</h2>
        <SyncStatus status={syncStatus} />
      </div>
      
      {!isAdding && <JobImportSection onImportSuccess={handleImportSuccess} />}

      <div className="flex justify-between items-center mb-6">
        <h3 className="text-[20px] leading-[1.4] font-semibold font-headline-sm text-on-surface flex items-center gap-2">
          Tracker
        </h3>
        <div className="flex items-center gap-3">
          <a
            href="https://www.linkedin.com/in/huntrr-bloom/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200 transition-colors flex items-center gap-2 text-[14px] font-semibold shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden md:inline">LinkedIn Profile</span>
          </a>
          {!isAdding && (
            <button 
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-full bg-primary text-on-primary hover:bg-primary/90 transition-colors flex items-center gap-2 text-[14px] font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Add Application</span>
            </button>
          )}
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-md mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <h4 className="text-[16px] md:text-[18px] font-semibold text-on-surface mb-6">
            {editingId ? 'Edit Application' : 'Review & Save Application'}
          </h4>
          
          {duplicateWarning && (
            <div className="mb-6 p-4 bg-warning-container text-on-warning-container rounded-xl border border-warning/30">
              <h5 className="font-bold flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5" /> Possible Duplicate Found</h5>
              <p className="text-[14px] mb-4">An application for <strong>{duplicateWarning.position}</strong> at <strong>{duplicateWarning.company}</strong> already exists.</p>
              <div className="flex flex-wrap gap-2">
                <button 
                  type="button"
                  onClick={() => startEditing(duplicateWarning)}
                  className="px-4 py-2 rounded-lg bg-surface text-on-surface border border-outline-variant text-[13px] font-bold hover:bg-surface-variant transition-colors"
                >
                  Open Existing Application
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setEditingId(duplicateWarning.id);
                    performSave(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-[13px] font-bold hover:bg-primary/90 transition-colors"
                >
                  Update Existing Application
                </button>
                <button 
                  type="button"
                  onClick={() => performSave(true)}
                  className="px-4 py-2 rounded-lg bg-surface text-on-surface border border-outline-variant text-[13px] font-bold hover:bg-surface-variant transition-colors"
                >
                  Save as Separate Application
                </button>
                <button 
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="px-4 py-2 rounded-lg text-on-surface-variant text-[13px] font-bold hover:bg-surface-variant transition-colors ml-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Company *</label>
              <input 
                type="text" 
                required
                value={formData.company}
                onChange={e => updateForm('company', e.target.value)}
                placeholder="e.g. Google"
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Position *</label>
              <input 
                type="text" 
                required
                value={formData.position}
                onChange={e => updateForm('position', e.target.value)}
                placeholder="e.g. Software Engineer"
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Status</label>
              <select 
                value={formData.status}
                onChange={e => updateForm('status', e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
              >
                <option value="Draft">Draft</option>
                <option value="Applied">Applied</option>
                <option value="Interview">Interview</option>
                <option value="Offer">Offer</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Date Applied</label>
              <input 
                type="date" 
                value={formData.dateApplied}
                onChange={e => updateForm('dateApplied', e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Location</label>
              <input type="text" value={formData.location || ''} onChange={e => updateForm('location', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="e.g. San Francisco, CA" />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Workplace Type</label>
              <input type="text" value={formData.workplaceType || ''} onChange={e => updateForm('workplaceType', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="e.g. Remote, Hybrid" />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Employment Type</label>
              <input type="text" value={formData.employmentType || ''} onChange={e => updateForm('employmentType', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="e.g. Full-time" />
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Application Deadline</label>
              <input type="text" value={formData.applicationDeadline || ''} onChange={e => updateForm('applicationDeadline', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Source (e.g. LinkedIn, Indeed)</label>
              <input type="text" value={formData.source || ''} onChange={e => updateForm('source', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Original URL</label>
              <input type="url" value={formData.originalUrl || ''} onChange={e => updateForm('originalUrl', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Job ID</label>
              <input type="text" value={formData.jobId || ''} onChange={e => updateForm('jobId', e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Link / URL (for Tracker)</label>
            <input 
              type="url" 
              value={formData.link || ''}
              onChange={e => updateForm('link', e.target.value)}
              placeholder="https://..."
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Short Summary</label>
            <textarea 
              value={formData.shortSummary || ''}
              onChange={e => updateForm('shortSummary', e.target.value)}
              placeholder="Brief description of the role..."
              rows={2}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-y"
            />
          </div>

          <div className="mb-4">
            <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">Responsibilities (one per line)</label>
            <textarea 
              value={(formData.responsibilities || []).join('\n')}
              onChange={e => updateForm('responsibilities', e.target.value.split('\n'))}
              rows={3}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-y"
            />
          </div>

          <div className="mb-6">
            <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">My Notes</label>
            <textarea 
              value={formData.notes || ''}
              onChange={e => updateForm('notes', e.target.value)}
              placeholder="Any details, contact info, or next steps..."
              rows={3}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-y"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
            <button 
              type="button" 
              onClick={() => { setIsAdding(false); resetForm(); }}
              className="px-6 py-2.5 rounded-full text-[14px] font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!formData.company?.trim() || !formData.position?.trim()}
              className="px-6 py-2.5 rounded-full text-[14px] font-medium bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Confirm and Save
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      ) : applications.length === 0 && !isAdding ? (
        <div className="text-center py-16 border-2 border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest/50">
          <div className="w-16 h-16 bg-surface-variant rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-on-surface-variant opacity-70" />
          </div>
          <h4 className="text-[16px] md:text-[18px] font-semibold text-on-surface mb-2">No applications yet</h4>
          <p className="text-[14px] text-on-surface-variant mb-6 max-w-sm mx-auto">Keep track of your job search progress by adding your first application.</p>
          <button 
            onClick={() => setIsAdding(true)}
            className="px-6 py-2.5 rounded-full bg-primary text-on-primary hover:bg-primary/90 transition-colors inline-flex items-center gap-2 text-[14px] font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Application
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {applications.map(app => (
            <div key={app.id} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-5 hover:border-primary/30 transition-colors shadow-sm flex flex-col group">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-[16px] md:text-[18px] font-bold text-on-surface leading-tight mb-1">{app.position}</h4>
                  <div className="text-[15px] font-medium text-primary">{app.company}</div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 border ${getStatusColor(app.status)}`}>
                  {getStatusIcon(app.status)}
                  {app.status}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-[13px] text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 opacity-70" />
                  <span>Applied: {app.dateApplied ? (() => { try { return format(parseISO(app.dateApplied), 'MMM d, yyyy'); } catch(e) { return 'Unknown Date'; } })() : 'Unknown'}</span>
                </div>
                {app.link && (
                  <a href={app.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                    <ExternalLink className="w-4 h-4 opacity-70" />
                    <span>View Posting</span>
                  </a>
                )}
                {app.location && (
                   <div className="flex items-center gap-1.5">
                     <span className="opacity-70">{app.location}</span>
                   </div>
                )}
              </div>
              
              {app.notes && (
                <div className="mb-4 text-[14px] text-on-surface/80 bg-surface-container-low/50 p-3 rounded-lg border border-outline-variant/10 whitespace-pre-wrap">
                  {app.notes}
                </div>
              )}
              
              <div className="mt-auto pt-4 border-t border-outline-variant/10 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => startEditing(app)}
                  className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container rounded-lg transition-colors"
                  aria-label="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => deleteApplication(app.id)}
                  className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
