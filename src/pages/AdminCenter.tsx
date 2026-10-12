import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, FileText, Package, Image as ImageIcon, MessageSquare, 
  Save, Send, Plus, Trash2, Edit3, CheckCircle, AlertCircle, RefreshCw, 
  ArrowLeft, Upload, Loader2, Phone, MapPin, Mail, Layers, Sparkles, X, Check
} from 'lucide-react';
import { db, storage, OperationType, handleFirestoreError } from '../firebase';
import { collection, doc, getDoc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import { BUSINESS_INFO, PRODUCTS, GALLERY_ITEMS, HERO_SLIDES } from '../data';
import { Product, GalleryItem, HeroSlide, HomePageData } from '../types';

interface AdminCenterProps {
  onNavigate: (path: string) => void;
}

type UploadState = 'IDLE' | 'SELECTED' | 'UPLOADING' | 'FINALIZING' | 'SAVING_REFERENCE' | 'SUCCESS' | 'FAILED' | 'CANCELED';

interface MediaUploadControlProps {
  label: string;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  folder?: string;
  onUploadStateChange?: (state: UploadState) => void;
}

const MediaUploadControl: React.FC<MediaUploadControlProps> = ({
  label,
  currentUrl,
  onUrlChange,
  folder = 'uploads',
  onUploadStateChange
}) => {
  const [uploadStatus, setUploadStatus] = useState<UploadState>('IDLE');
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>(currentUrl || '');
  const activeTaskRef = useRef<UploadTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrlInput(currentUrl || '');
  }, [currentUrl]);

  const updateState = (state: UploadState) => {
    setUploadStatus(state);
    if (onUploadStateChange) onUploadStateChange(state);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage("Please select a valid image file (JPEG, PNG, WebP).");
      updateState('FAILED');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Image file exceeds 10MB limit.");
      updateState('FAILED');
      return;
    }

    setSelectedFileName(file.name);
    setErrorMessage(null);
    updateState('SELECTED');

    startUpload(file);
  };

  const startUpload = (file: File) => {
    try {
      updateState('UPLOADING');
      setProgress(0);

      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageRef = ref(storage, `${folder}/${Date.now()}_${cleanFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      activeTaskRef.current = uploadTask;

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(pct);
          if (pct >= 100) {
            updateState('FINALIZING');
          }
        },
        (error: any) => {
          console.error("Firebase Storage upload error:", error);
          let friendlyError = "Upload failed. ";
          if (error.code === 'storage/unauthorized') {
            friendlyError += "Storage permissions denied. Check Firebase Storage rules.";
          } else if (error.code === 'storage/canceled') {
            friendlyError += "Upload was canceled.";
            updateState('CANCELED');
            return;
          } else if (error.code === 'storage/unknown' || error.status_ === 404) {
            friendlyError += "Storage bucket not found (404). Please ensure Cloud Storage is activated in Firebase Console for this project, or paste an image URL below.";
          } else {
            friendlyError += error.message || "Please check your network connection.";
          }
          setErrorMessage(friendlyError);
          updateState('FAILED');
          activeTaskRef.current = null;
        },
        async () => {
          updateState('SAVING_REFERENCE');
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            onUrlChange(downloadUrl);
            setUrlInput(downloadUrl);
            updateState('SUCCESS');
            setTimeout(() => {
              updateState('IDLE');
              setProgress(0);
            }, 3000);
          } catch (err: any) {
            setErrorMessage("Image uploaded but failed to retrieve download URL.");
            updateState('FAILED');
          } finally {
            activeTaskRef.current = null;
          }
        }
      );
    } catch (err: any) {
      console.error("Initiation error:", err);
      setErrorMessage("Failed to initiate upload task. " + (err.message || ''));
      updateState('FAILED');
    }
  };

  const cancelUpload = () => {
    if (activeTaskRef.current) {
      activeTaskRef.current.cancel();
      activeTaskRef.current = null;
      updateState('CANCELED');
      setErrorMessage("Upload canceled by user.");
    }
  };

  const handleManualUrlSave = () => {
    if (urlInput.trim()) {
      onUrlChange(urlInput.trim());
      updateState('SUCCESS');
      setTimeout(() => updateState('IDLE'), 2000);
    }
  };

  return (
    <div className="bg-[#F6F1E8]/60 p-4 rounded-xl border border-[#D8CEC0] space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider font-semibold text-[#5A3E2B]">
          {label}
        </label>
        {uploadStatus === 'UPLOADING' && (
          <span className="text-[11px] font-medium text-[#C9A45C]">
            Uploading {progress}%
          </span>
        )}
        {uploadStatus === 'FINALIZING' && (
          <span className="text-[11px] font-medium text-amber-600">
            Finalizing upload...
          </span>
        )}
        {uploadStatus === 'SUCCESS' && (
          <span className="text-[11px] font-medium text-emerald-600 flex items-center">
            <Check className="w-3 h-3 mr-1" /> Ready
          </span>
        )}
      </div>

      {/* Preview Box */}
      {currentUrl && (
        <div className="relative h-36 rounded-lg overflow-hidden border border-[#D8CEC0] bg-[#1C1511]">
          <img
            src={currentUrl}
            alt={label}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white">
            Current Image
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {(uploadStatus === 'UPLOADING' || uploadStatus === 'FINALIZING') && (
        <div className="space-y-1">
          <div className="w-full bg-[#D8CEC0] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#C9A45C] h-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-[#3A271C]">
            <span>{selectedFileName}</span>
            <button
              onClick={cancelUpload}
              className="text-red-600 hover:underline flex items-center"
            >
              <X className="w-3 h-3 mr-0.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {uploadStatus === 'FAILED' && errorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
          <div className="flex-grow">
            <p className="font-medium">Upload Error</p>
            <p className="text-[11px] mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Upload Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadStatus === 'UPLOADING' || uploadStatus === 'FINALIZING'}
          className="inline-flex items-center justify-center px-4 py-2 bg-[#3A271C] text-[#F6F1E8] rounded-lg hover:bg-[#5A3E2B] text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5 mr-1.5 text-[#C9A45C]" /> Select Device Image
        </button>

        {/* Manual URL input fallback */}
        <div className="flex flex-grow gap-1">
          <input
            type="text"
            placeholder="Or paste image URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-grow px-3 py-1.5 rounded-lg border border-[#D8CEC0] text-xs bg-white focus:outline-none focus:border-[#C9A45C]"
          />
          {urlInput !== currentUrl && (
            <button
              type="button"
              onClick={handleManualUrlSave}
              className="px-3 py-1.5 bg-[#C9A45C] text-[#1C1511] rounded-lg text-xs font-medium uppercase hover:bg-[#DFC27A]"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const AdminCenter: React.FC<AdminCenterProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'hero' | 'content' | 'products' | 'gallery' | 'inquiries'>('hero');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Global Settings State
  const [settings, setSettings] = useState(BUSINESS_INFO);

  // Dedicated Three Hero Slides State (strictly 3 slides)
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(HERO_SLIDES);

  // Homepage Editorial Content
  const [editorial, setEditorial] = useState({
    title: "FURNITURE FOR THE WAY YOU LIVE.",
    subtitle: "Tatari Furniture Showcase",
    text: "Explore furniture created to bring comfort, style and character into everyday spaces. Located in Jos, we offer carefully curated pieces that define modern Nigerian living with elegance and durability.",
    image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=85"
  });

  // Other Page Content State
  const [aboutContent, setAboutContent] = useState({
    title: "Our Heritage & Craftsmanship",
    subtitle: "Dedicated to superior quality and timeless interior beauty in Plateau State.",
    story: "Founded in the heart of Jos at 179 Dogon Karfi, Tatari Furniture has grown to become the benchmark for luxury interior furnishing and custom carpentry."
  });

  // Products State
  const [productsList, setProductsList] = useState<Product[]>(PRODUCTS);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isNewProduct, setIsNewProduct] = useState<boolean>(false);

  // Gallery State
  const [galleryList, setGalleryList] = useState<GalleryItem[]>(GALLERY_ITEMS);
  const [editingGallery, setEditingGallery] = useState<GalleryItem | null>(null);
  const [isNewGallery, setIsNewGallery] = useState<boolean>(false);

  // Inquiries State
  const [inquiries, setInquiries] = useState<any[]>([]);

  useEffect(() => {
    loadAllAdminData();
  }, []);

  const loadAllAdminData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      // Parallel loading of all collections and documents for maximum performance
      const [
        settingsSnap,
        homeDraftSnap,
        aboutDraftSnap,
        prodSnap,
        galSnap,
        inqSnap
      ] = await Promise.all([
        getDoc(doc(db, 'settings', 'global')),
        getDoc(doc(db, 'pagesDrafts', 'home')),
        getDoc(doc(db, 'pagesDrafts', 'about')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'galleryItems')),
        getDocs(collection(db, 'inquiries'))
      ]);

      // 1. Settings
      if (settingsSnap.exists()) {
        setSettings({ ...BUSINESS_INFO, ...(settingsSnap.data() as any) });
      }

      // 2. Home Draft
      if (homeDraftSnap.exists()) {
        const homeData = homeDraftSnap.data();
        if (Array.isArray(homeData.heroSlides) && homeData.heroSlides.length === 3) {
          setHeroSlides(homeData.heroSlides);
        }
        setEditorial(prev => ({
          title: homeData.editorialTitle || prev.title,
          subtitle: homeData.editorialSubtitle || prev.subtitle,
          text: homeData.editorialText || prev.text,
          image: homeData.editorialImage || prev.image
        }));
      }

      // 3. About Draft
      if (aboutDraftSnap.exists()) {
        setAboutContent(prev => ({ ...prev, ...(aboutDraftSnap.data() as any) }));
      }

      // 4. Products
      if (!prodSnap.empty) {
        const prods: Product[] = [];
        prodSnap.forEach(d => {
          const item = d.data() as Product;
          if (item && item.id) prods.push(item);
        });
        if (prods.length > 0) setProductsList(prods);
      }

      // 5. Gallery
      if (!galSnap.empty) {
        const gals: GalleryItem[] = [];
        galSnap.forEach(d => {
          const item = d.data() as GalleryItem;
          if (item && item.id) gals.push(item);
        });
        if (gals.length > 0) setGalleryList(gals);
      }

      // 6. Inquiries
      if (!inqSnap.empty) {
        const inqs: any[] = [];
        inqSnap.forEach(d => inqs.push({ id: d.id, ...d.data() }));
        setInquiries(inqs);
      }

    } catch (error) {
      console.error("Error loading admin data:", error);
      setErrorMessage("Could not load all Firestore data. Using default data where required.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSlide = (slideIndex: number, updatedFields: Partial<HeroSlide>) => {
    setHeroSlides(prevSlides => {
      const newSlides = [...prevSlides];
      newSlides[slideIndex] = { ...newSlides[slideIndex], ...updatedFields };
      return newSlides;
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const homeDraftPayload: HomePageData = {
        heroSlides,
        editorialTitle: editorial.title,
        editorialSubtitle: editorial.subtitle,
        editorialText: editorial.text,
        editorialImage: editorial.image
      };

      // Execute writes in parallel
      await Promise.all([
        setDoc(doc(db, 'settings', 'global'), settings),
        setDoc(doc(db, 'pagesDrafts', 'home'), homeDraftPayload),
        setDoc(doc(db, 'pagesDrafts', 'about'), aboutContent),
        ...productsList.map(p => setDoc(doc(db, 'products', p.id), p)),
        ...galleryList.map(g => setDoc(doc(db, 'galleryItems', g.id), g))
      ]);

      setHasUnsavedChanges(false);
      setSuccessMessage("Draft saved successfully to Firestore.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (error: any) {
      console.error("Save Draft Error:", error);
      setErrorMessage("Failed to save draft to Firestore: " + (error.message || ''));
      handleFirestoreError(error, OperationType.WRITE, 'pagesDrafts/home');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const homePublishedPayload = {
        heroSlides,
        editorialTitle: editorial.title,
        editorialSubtitle: editorial.subtitle,
        editorialText: editorial.text,
        editorialImage: editorial.image,
        publishedAt: new Date().toISOString()
      };

      // Save draft first and publish simultaneously
      await Promise.all([
        setDoc(doc(db, 'settings', 'global'), settings),
        setDoc(doc(db, 'pagesDrafts', 'home'), homePublishedPayload),
        setDoc(doc(db, 'pagesPublished', 'home'), homePublishedPayload),
        setDoc(doc(db, 'pagesPublished', 'about'), { ...aboutContent, publishedAt: new Date().toISOString() }),
        ...productsList.map(p => setDoc(doc(db, 'products', p.id), p)),
        ...galleryList.map(g => setDoc(doc(db, 'galleryItems', g.id), g))
      ]);

      setHasUnsavedChanges(false);
      setSuccessMessage("Changes published successfully! Public website updated.");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error: any) {
      console.error("Publish Error:", error);
      setErrorMessage("Failed to publish changes: " + (error.message || ''));
      handleFirestoreError(error, OperationType.WRITE, 'pagesPublished/home');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F1E8] flex items-center justify-center pt-24">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#C9A45C] mx-auto" />
          <p className="font-serif text-xl text-[#1C1511]">Loading Tatari Admin Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F1E8] pt-24 pb-20 font-sans">
      {/* Top Admin Header */}
      <div className="bg-[#1C1511] text-[#F6F1E8] py-6 px-4 sm:px-8 shadow-xl border-b border-[#3A271C]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => onNavigate('/')}
                className="inline-flex items-center text-xs text-[#C9A45C] hover:text-white transition-colors uppercase tracking-wider bg-[#3A271C] px-3 py-1.5 rounded-full"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> View Public Site
              </button>
              <span className="text-xs uppercase tracking-[0.2em] text-[#D8CEC0]/60">Secure Management Portal</span>
              {hasUnsavedChanges && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Unsaved Changes
                </span>
              )}
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-[#F6F1E8] mt-2">
              Tatari Admin Center
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="inline-flex items-center rounded-full bg-[#3A271C] hover:bg-[#5A3E2B] text-[#F6F1E8] font-medium text-xs tracking-wider uppercase px-5 py-3 transition-colors shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2 text-[#C9A45C]" />}
              Save Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex items-center rounded-full bg-[#C9A45C] hover:bg-[#DFC27A] text-[#1C1511] font-semibold text-xs tracking-wider uppercase px-6 py-3 transition-all shadow-lg hover:scale-105 disabled:opacity-50"
            >
              {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Publish Changes
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center space-x-3 shadow-sm mb-6 animate-fadeIn">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        )}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start space-x-3 shadow-sm mb-6 animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Main Admin Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        <div className="flex flex-wrap gap-2 border-b border-[#D8CEC0] pb-4">
          <button
            onClick={() => setActiveTab('hero')}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-medium transition-all ${
              activeTab === 'hero'
                ? 'bg-[#1C1511] text-[#F6F1E8] shadow-md'
                : 'bg-white text-[#3A271C] border border-[#D8CEC0] hover:bg-[#D8CEC0]/30'
            }`}
          >
            <Layers className="w-4 h-4 text-[#C9A45C]" />
            <span>Hero Slides (3)</span>
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-medium transition-all ${
              activeTab === 'content'
                ? 'bg-[#1C1511] text-[#F6F1E8] shadow-md'
                : 'bg-white text-[#3A271C] border border-[#D8CEC0] hover:bg-[#D8CEC0]/30'
            }`}
          >
            <FileText className="w-4 h-4 text-[#C9A45C]" />
            <span>Editorial & Story</span>
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-medium transition-all ${
              activeTab === 'products'
                ? 'bg-[#1C1511] text-[#F6F1E8] shadow-md'
                : 'bg-white text-[#3A271C] border border-[#D8CEC0] hover:bg-[#D8CEC0]/30'
            }`}
          >
            <Package className="w-4 h-4 text-[#C9A45C]" />
            <span>Products ({productsList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-medium transition-all ${
              activeTab === 'gallery'
                ? 'bg-[#1C1511] text-[#F6F1E8] shadow-md'
                : 'bg-white text-[#3A271C] border border-[#D8CEC0] hover:bg-[#D8CEC0]/30'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-[#C9A45C]" />
            <span>Gallery ({galleryList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-medium transition-all ${
              activeTab === 'settings'
                ? 'bg-[#1C1511] text-[#F6F1E8] shadow-md'
                : 'bg-white text-[#3A271C] border border-[#D8CEC0] hover:bg-[#D8CEC0]/30'
            }`}
          >
            <Settings className="w-4 h-4 text-[#C9A45C]" />
            <span>Site Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('inquiries')}
            className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-medium transition-all ${
              activeTab === 'inquiries'
                ? 'bg-[#1C1511] text-[#F6F1E8] shadow-md'
                : 'bg-white text-[#3A271C] border border-[#D8CEC0] hover:bg-[#D8CEC0]/30'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-[#C9A45C]" />
            <span>Inquiries ({inquiries.length})</span>
          </button>
        </div>

        {/* Tab: Hero Slides Management (Independent 3 Slides) */}
        {activeTab === 'hero' && (
          <div className="space-y-8 mt-8 animate-fadeIn">
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-[#D8CEC0]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#D8CEC0] pb-4 mb-6">
                <div>
                  <h2 className="font-serif text-3xl font-normal text-[#1C1511]">Hero Slide Management</h2>
                  <p className="text-xs text-[#3A271C]/70 mt-1">
                    Manage the 3 cinematic slides displayed in the public homepage carousel. Each slide operates independently.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold px-3 py-1 bg-[#1C1511] text-[#C9A45C] rounded-full uppercase tracking-wider">
                    Exactly 3 Slides
                  </span>
                </div>
              </div>

              {/* 3 Dedicated Slide Panels */}
              <div className="space-y-8">
                {heroSlides.map((slide, index) => (
                  <div
                    key={slide.id || index}
                    className="p-6 rounded-2xl border border-[#D8CEC0] bg-[#F6F1E8]/30 space-y-6"
                  >
                    <div className="flex items-center justify-between border-b border-[#D8CEC0] pb-3">
                      <div className="flex items-center space-x-3">
                        <span className="w-7 h-7 rounded-full bg-[#1C1511] text-[#C9A45C] text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <h3 className="font-serif text-xl font-normal text-[#1C1511]">
                          HERO SLIDE {index + 1}
                        </h3>
                      </div>
                      <span className="text-xs text-[#5A3E2B] font-medium tracking-wider uppercase">
                        {slide.badge || `Slide ${index + 1}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Text & Badge */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">
                            Badge Text
                          </label>
                          <input
                            type="text"
                            value={slide.badge}
                            onChange={(e) => handleUpdateSlide(index, { badge: e.target.value })}
                            className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A45C]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">
                            Main Heading
                          </label>
                          <input
                            type="text"
                            value={slide.title}
                            onChange={(e) => handleUpdateSlide(index, { title: e.target.value })}
                            className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A45C]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">
                            Subtitle Description
                          </label>
                          <textarea
                            rows={3}
                            value={slide.subtitle}
                            onChange={(e) => handleUpdateSlide(index, { subtitle: e.target.value })}
                            className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A45C]"
                          />
                        </div>
                      </div>

                      {/* Right: Resumable Media Uploader for this Slide */}
                      <div>
                        <MediaUploadControl
                          label={`Slide ${index + 1} Background Image`}
                          currentUrl={slide.image}
                          folder={`hero/slide_${index + 1}`}
                          onUrlChange={(newUrl) => handleUpdateSlide(index, { image: newUrl })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Editorial & Homepage Story */}
        {activeTab === 'content' && (
          <div className="space-y-8 mt-8 animate-fadeIn">
            {/* Editorial Showcase Section */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-[#D8CEC0] space-y-6">
              <div className="border-b border-[#D8CEC0] pb-4">
                <h2 className="font-serif text-3xl font-normal text-[#1C1511]">Homepage Editorial Showcase</h2>
                <p className="text-xs text-[#3A271C]/70 mt-1">
                  Manage the editorial introduction section and its showcase image displayed directly below the Hero carousel on the homepage.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">
                      Editorial Eyebrow / Subtitle
                    </label>
                    <input
                      type="text"
                      value={editorial.subtitle}
                      onChange={(e) => {
                        setEditorial({ ...editorial, subtitle: e.target.value });
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A45C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">
                      Editorial Main Heading
                    </label>
                    <input
                      type="text"
                      value={editorial.title}
                      onChange={(e) => {
                        setEditorial({ ...editorial, title: e.target.value });
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A45C]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">
                      Editorial Paragraph
                    </label>
                    <textarea
                      rows={4}
                      value={editorial.text}
                      onChange={(e) => {
                        setEditorial({ ...editorial, text: e.target.value });
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A45C]"
                    />
                  </div>
                </div>

                {/* Editorial Image Uploader */}
                <div>
                  <MediaUploadControl
                    label="Editorial Showcase Image"
                    currentUrl={editorial.image}
                    folder="editorial"
                    onUrlChange={(newUrl) => {
                      setEditorial({ ...editorial, image: newUrl });
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* About Page Story */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-lg border border-[#D8CEC0] space-y-6">
              <h2 className="font-serif text-2xl font-normal text-[#1C1511]">About Page Heritage & Story</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Heading</label>
                  <input
                    type="text"
                    value={aboutContent.title}
                    onChange={(e) => {
                      setAboutContent({ ...aboutContent, title: e.target.value });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Subtitle</label>
                  <input
                    type="text"
                    value={aboutContent.subtitle}
                    onChange={(e) => {
                      setAboutContent({ ...aboutContent, subtitle: e.target.value });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Brand Story</label>
                  <textarea
                    rows={4}
                    value={aboutContent.story}
                    onChange={(e) => {
                      setAboutContent({ ...aboutContent, story: e.target.value });
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Products Management */}
        {activeTab === 'products' && (
          <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-[#D8CEC0] mt-8 space-y-8 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-normal text-[#1C1511]">Products Catalog</h2>
                <p className="text-sm text-[#3A271C]/70">Add, edit, or remove furniture pieces displayed across living room, bedroom, and custom collections.</p>
              </div>
              <button
                onClick={() => {
                  setEditingProduct({
                    id: `p-${Date.now()}`,
                    name: '',
                    category: 'living-room',
                    categoryLabel: 'Living Room',
                    image: '',
                    description: '',
                    materials: ''
                  });
                  setIsNewProduct(true);
                }}
                className="inline-flex items-center justify-center rounded-full bg-[#1C1511] hover:bg-[#3A271C] text-[#F6F1E8] font-medium text-xs tracking-wider uppercase px-5 py-3 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4 mr-2 text-[#C9A45C]" /> Add New Product
              </button>
            </div>

            {/* Product Edit Modal / Form */}
            {editingProduct && (
              <div className="bg-[#F6F1E8] p-6 rounded-2xl border border-[#C9A45C] space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif text-xl font-medium text-[#1C1511]">
                    {isNewProduct ? 'Add New Product' : 'Edit Product'}
                  </h3>
                  <button onClick={() => setEditingProduct(null)} className="text-xs text-[#5A3E2B] underline">Cancel</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Product Name</label>
                    <input
                      type="text"
                      value={editingProduct.name}
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Category</label>
                    <select
                      value={editingProduct.category}
                      onChange={(e) => {
                        const cat = e.target.value as any;
                        const label = cat === 'living-room' ? 'Living Room' : cat === 'bedroom' ? 'Bedroom' : cat === 'custom' ? 'Custom Furniture' : 'Other Furniture';
                        setEditingProduct({ ...editingProduct, category: cat, categoryLabel: label });
                      }}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    >
                      <option value="living-room">Living Room</option>
                      <option value="bedroom">Bedroom</option>
                      <option value="custom">Custom Furniture</option>
                      <option value="other">Other Furniture</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <MediaUploadControl
                      label="Product Photo"
                      currentUrl={editingProduct.image}
                      folder="products"
                      onUrlChange={(url) => setEditingProduct({ ...editingProduct, image: url })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={editingProduct.description}
                      onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Materials</label>
                    <input
                      type="text"
                      value={editingProduct.materials || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, materials: e.target.value })}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      if (isNewProduct) {
                        setProductsList([editingProduct, ...productsList]);
                      } else {
                        setProductsList(productsList.map(p => p.id === editingProduct.id ? editingProduct : p));
                      }
                      setEditingProduct(null);
                      setHasUnsavedChanges(true);
                      setSuccessMessage("Product updated in admin list. Click 'Save Draft' or 'Publish Changes' to persist.");
                    }}
                    className="rounded-full bg-[#1C1511] text-[#F6F1E8] px-6 py-2.5 text-xs font-medium uppercase tracking-wider"
                  >
                    {isNewProduct ? 'Add Product' : 'Apply Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {productsList.map((product) => (
                <div key={product.id} className="bg-white rounded-xl border border-[#D8CEC0] overflow-hidden shadow-sm flex flex-col justify-between">
                  <div className="relative h-48 bg-[#1C1511]">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <span className="absolute top-2 left-2 bg-[#1C1511]/80 text-[#C9A45C] text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                      {product.categoryLabel}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col flex-grow justify-between">
                    <div>
                      <h4 className="font-serif text-lg font-medium text-[#1C1511] mb-1">{product.name}</h4>
                      <p className="text-xs text-[#3A271C]/70 line-clamp-2 mb-3">{product.description}</p>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-[#D8CEC0]/60">
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setIsNewProduct(false);
                        }}
                        className="inline-flex items-center text-xs text-[#5A3E2B] font-medium hover:text-[#1C1511]"
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1 text-[#C9A45C]" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          setProductsList(productsList.filter(p => p.id !== product.id));
                          setHasUnsavedChanges(true);
                        }}
                        className="inline-flex items-center text-xs text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Gallery Management */}
        {activeTab === 'gallery' && (
          <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-[#D8CEC0] mt-8 space-y-8 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-normal text-[#1C1511]">Showroom & Gallery Manager</h2>
                <p className="text-sm text-[#3A271C]/70">Add, edit, or remove photos displayed in the public showroom gallery.</p>
              </div>
              <button
                onClick={() => {
                  setEditingGallery({
                    id: `g-${Date.now()}`,
                    title: '',
                    category: 'Living Room',
                    image: '',
                    description: ''
                  });
                  setIsNewGallery(true);
                }}
                className="inline-flex items-center justify-center rounded-full bg-[#1C1511] hover:bg-[#3A271C] text-[#F6F1E8] font-medium text-xs tracking-wider uppercase px-5 py-3 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4 mr-2 text-[#C9A45C]" /> Add Gallery Photo
              </button>
            </div>

            {editingGallery && (
              <div className="bg-[#F6F1E8] p-6 rounded-2xl border border-[#C9A45C] space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-serif text-xl font-medium text-[#1C1511]">
                    {isNewGallery ? 'Add Gallery Item' : 'Edit Gallery Item'}
                  </h3>
                  <button onClick={() => setEditingGallery(null)} className="text-xs text-[#5A3E2B] underline">Cancel</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Title</label>
                    <input
                      type="text"
                      value={editingGallery.title}
                      onChange={(e) => setEditingGallery({ ...editingGallery, title: e.target.value })}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Category</label>
                    <select
                      value={editingGallery.category}
                      onChange={(e) => setEditingGallery({ ...editingGallery, category: e.target.value as any })}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    >
                      <option value="Living Room">Living Room</option>
                      <option value="Bedroom">Bedroom</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Showroom">Showroom</option>
                      <option value="Interiors">Interiors</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <MediaUploadControl
                      label="Gallery Image"
                      currentUrl={editingGallery.image}
                      folder="gallery"
                      onUrlChange={(url) => setEditingGallery({ ...editingGallery, image: url })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={editingGallery.description}
                      onChange={(e) => setEditingGallery({ ...editingGallery, description: e.target.value })}
                      className="w-full rounded-xl border border-[#D8CEC0] px-4 py-2.5 text-sm bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      if (isNewGallery) {
                        setGalleryList([editingGallery, ...galleryList]);
                      } else {
                        setGalleryList(galleryList.map(g => g.id === editingGallery.id ? editingGallery : g));
                      }
                      setEditingGallery(null);
                      setHasUnsavedChanges(true);
                      setSuccessMessage("Gallery item updated. Click Save Draft to persist.");
                    }}
                    className="rounded-full bg-[#1C1511] text-[#F6F1E8] px-6 py-2.5 text-xs font-medium uppercase tracking-wider"
                  >
                    {isNewGallery ? 'Add Item' : 'Apply Changes'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {galleryList.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-[#D8CEC0] overflow-hidden shadow-sm flex flex-col justify-between">
                  <div className="relative h-40 bg-[#1C1511]">
                    <img src={item.image} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <span className="absolute top-2 left-2 bg-[#1C1511]/80 text-[#C9A45C] text-[10px] uppercase px-2.5 py-0.5 rounded-full">
                      {item.category}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col flex-grow justify-between">
                    <div>
                      <h4 className="font-serif text-base font-medium text-[#1C1511] mb-1">{item.title}</h4>
                      <p className="text-xs text-[#3A271C]/70 line-clamp-2 mb-3">{item.description}</p>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-[#D8CEC0]/60">
                      <button
                        onClick={() => {
                          setEditingGallery(item);
                          setIsNewGallery(false);
                        }}
                        className="inline-flex items-center text-xs text-[#5A3E2B] font-medium"
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1 text-[#C9A45C]" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          setGalleryList(galleryList.filter(g => g.id !== item.id));
                          setHasUnsavedChanges(true);
                        }}
                        className="inline-flex items-center text-xs text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Site Settings */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-[#D8CEC0] mt-8 space-y-8 animate-fadeIn">
            <div>
              <h2 className="font-serif text-3xl font-normal text-[#1C1511] mb-2">Global Business Settings</h2>
              <p className="text-sm text-[#3A271C]/70">Manage business name, contact details, phone numbers, WhatsApp, and location in Jos.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">Business Name</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => {
                    setSettings({ ...settings, name: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">Tagline</label>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => {
                    setSettings({ ...settings, tagline: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">Phone Number (Display)</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => {
                    setSettings({ ...settings, phone: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">International Phone (for calling/WhatsApp)</label>
                <input
                  type="text"
                  value={settings.phoneInternational}
                  onChange={(e) => {
                    setSettings({ ...settings, phoneInternational: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">WhatsApp Link / Number URL</label>
                <input
                  type="text"
                  value={settings.whatsappUrl}
                  onChange={(e) => {
                    setSettings({ ...settings, whatsappUrl: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">Google Maps Link</label>
                <input
                  type="text"
                  value={settings.mapUrl}
                  onChange={(e) => {
                    setSettings({ ...settings, mapUrl: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">Physical Address in Jos</label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={(e) => {
                    setSettings({ ...settings, address: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider font-semibold text-[#5A3E2B] mb-2">Business Description</label>
                <textarea
                  rows={4}
                  value={settings.description}
                  onChange={(e) => {
                    setSettings({ ...settings, description: e.target.value });
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full rounded-xl border border-[#D8CEC0] px-4 py-3 text-sm focus:outline-none focus:border-[#C9A45C]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Customer Inquiries */}
        {activeTab === 'inquiries' && (
          <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-lg border border-[#D8CEC0] mt-8 space-y-6 animate-fadeIn">
            <div>
              <h2 className="font-serif text-3xl font-normal text-[#1C1511] mb-2">Customer Inquiries</h2>
              <p className="text-sm text-[#3A271C]/70">Messages submitted by customers through the public contact form.</p>
            </div>

            {inquiries.length === 0 ? (
              <div className="text-center py-16 bg-[#F6F1E8]/50 rounded-2xl border border-dashed border-[#D8CEC0]">
                <MessageSquare className="w-12 h-12 text-[#C9A45C] mx-auto mb-3 opacity-60" />
                <p className="font-serif text-xl text-[#1C1511]">No inquiries received yet.</p>
                <p className="text-xs text-[#3A271C]/70 mt-1">Submissions from the public Contact page will appear here instantly.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {inquiries.map((inq) => (
                  <div key={inq.id} className="bg-[#F6F1E8]/50 rounded-xl p-6 border border-[#D8CEC0] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <span className="font-serif text-lg font-medium text-[#1C1511]">{inq.fullName}</span>
                        <span className="bg-[#C9A45C]/20 text-[#5A3E2B] text-xs font-semibold px-3 py-0.5 rounded-full uppercase">
                          {inq.category || 'General'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-[#3A271C]">
                        <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1 text-[#C9A45C]" /> {inq.phone}</span>
                        {inq.createdAt && <span>Submitted: {new Date(inq.createdAt).toLocaleString()}</span>}
                        {inq.preferredContact && <span>Prefers: {inq.preferredContact}</span>}
                      </div>
                      <p className="text-sm text-[#1C1511] font-light bg-white p-3 rounded-lg border border-[#D8CEC0]">
                        {inq.message}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <a
                        href={`tel:${inq.phone}`}
                        className="inline-flex items-center justify-center bg-[#1C1511] text-[#F6F1E8] px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-wider hover:bg-[#3A271C]"
                      >
                        Call
                      </a>
                      <button
                        onClick={async () => {
                          try {
                            await deleteDoc(doc(db, 'inquiries', inq.id));
                            setInquiries(inquiries.filter(i => i.id !== inq.id));
                            setSuccessMessage("Inquiry deleted.");
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="inline-flex items-center justify-center bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
