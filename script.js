import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA9gpJ4r6FVzeX8b00JvNblzE8dkhUGFk4",
  authDomain: "mis-apuntes-e4ea1.firebaseapp.com",
  projectId: "mis-apuntes-e4ea1",
  storageBucket: "mis-apuntes-e4ea1.firebasestorage.app",
  messagingSenderId: "204311657869",
  appId: "1:204311657869:web:8fe5511b8627c012a791c4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// DB FUNCIONES (FIREBASE)
// ==========================================
async function getSubjectsDB() {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    const q = query(collection(db, `users/${user.uid}/materias`));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function saveSubjectDB(subject) {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    const subjectRef = doc(db, `users/${user.uid}/materias`, subject.id);
    await setDoc(subjectRef, subject);
}

async function deleteSubjectAndApuntesDB(materiaId) {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    
    // Borrar materia
    await deleteDoc(doc(db, `users/${user.uid}/materias`, materiaId));
    
    // Borrar apuntes (Firestore)
    const q = query(collection(db, `users/${user.uid}/apuntes`), where('materiaId', '==', materiaId));
    const snapshot = await getDocs(q);
    
    for (const d of snapshot.docs) {
        await deleteDoc(d.ref);
    }
}

async function getApuntesDB(materiaId) {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    const q = query(collection(db, `users/${user.uid}/apuntes`), where('materiaId', '==', materiaId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function saveApunteDB(apunte) {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");

    // Guardar en Firestore CON el base64 ligero
    await setDoc(doc(db, `users/${user.uid}/apuntes`, apunte.id), apunte);
}

async function deleteApunteDB(apunteId) {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    
    // Borrar de Firestore
    await deleteDoc(doc(db, `users/${user.uid}/apuntes`, apunteId));
}

// ==========================================
// COMPRESIÓN DE IMÁGENES Y LECTURA
// ==========================================
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                const MAX_WIDTH = 1000;
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Comprimir a JPEG con calidad 0.6 para garantizar < 1MB en Firestore
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Error al cargar la imagen."));
        };
        reader.onerror = () => reject(new Error("Error al leer el archivo."));
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Error al leer el archivo."));
    });
}

// ==========================================
// INTEGRACIÓN CON CLOUDINARY
// ==========================================
async function uploadToCloudinary(fileOrBase64) {
    // 1. Obtener la firma de seguridad desde el backend
    const signResponse = await fetch('/api/sign-upload');
    if (!signResponse.ok) {
        throw new Error("Error obteniendo firma de seguridad.");
    }
    const { signature, timestamp, cloudName, apiKey } = await signResponse.json();

    // 2. Subir archivo usando la firma (Signed Upload)
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
    const formData = new FormData();
    
    formData.append("file", fileOrBase64);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);

    const response = await fetch(url, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        throw new Error("Error al subir archivo protegido a Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


// Variables globales App
let subjects = [];
let activeSubjectId = null;

document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias DOM (Autenticación) ---
    const authCard = document.getElementById('auth-card');
    const authContainer = authCard ? authCard.parentElement : null;
    const appContainer = document.getElementById('app-container');
    const blockCreatePassword = document.getElementById('block-create-password');
    const blockLogin = document.getElementById('block-login');
    const btnSave = document.getElementById('btn-save');
    const btnLogin = document.getElementById('btn-login');
    const inputNewEmail = document.getElementById('input-new-email');
    const inputNewPassword = document.getElementById('new-password');
    const inputConfirmPassword = document.getElementById('confirm-password');
    const inputLoginEmail = document.getElementById('input-login-email');
    const inputLoginPassword = document.getElementById('login-password');
    const createError = document.getElementById('create-error');
    const loginError = document.getElementById('login-error');
    const linkToRegister = document.getElementById('link-to-register');
    const linkToLogin = document.getElementById('link-to-login');
    const btnLogout = document.getElementById('btn-logout');

    // --- Referencias DOM (App - Materias) ---
    const subjectList = document.getElementById('subject-list');
    const btnNewSubject = document.getElementById('btn-new-subject');
    const emptySubjectsState = document.getElementById('empty-subjects-state');
    const activeSubjectPanel = document.getElementById('active-subject-panel');
    const activeSubjectTitle = document.getElementById('active-subject-title');
    const btnDeleteSubject = document.getElementById('btn-delete-subject');
    
    const modalNewSubject = document.getElementById('modal-new-subject');
    const inputSubjectName = document.getElementById('input-subject-name');
    const btnCancelSubject = document.getElementById('btn-cancel-subject');
    const btnSaveSubject = document.getElementById('btn-save-subject');
    const modalError = document.getElementById('modal-error');

    // --- Referencias DOM (App - Apuntes) ---
    const btnAddNote = document.getElementById('btn-add-note');
    const emptyNotesState = document.getElementById('empty-notes-state');
    const notesGrid = document.getElementById('notes-grid');
    
    const modalNewNote = document.getElementById('modal-new-note');
    const inputNoteTitle = document.getElementById('input-note-title');
    const inputNoteFile = document.getElementById('input-note-file');
    const btnCancelNote = document.getElementById('btn-cancel-note');
    const btnSaveNote = document.getElementById('btn-save-note');
    const noteModalError = document.getElementById('note-modal-error');
    const globalLoader = document.getElementById('global-loader');

    // --- Referencias DOM (QR de Materia) ---
    const btnShowSubjectQr = document.getElementById('btn-show-subject-qr');
    const modalSubjectQr = document.getElementById('modal-subject-qr');
    const subjectQrName = document.getElementById('subject-qr-name');
    const subjectQrContainer = document.getElementById('subject-qr-container');
    const btnCloseSubjectQr = document.getElementById('btn-close-subject-qr');
    const btnDownloadSubjectQr = document.getElementById('btn-download-subject-qr');

    // --- Referencias DOM (Modo Subir) ---
    const uploadModeContainer = document.getElementById('upload-mode-container');
    const uploadSubjectTitle = document.getElementById('upload-subject-title');
    const inputUploadTitle = document.getElementById('input-upload-title');
    const inputUploadFile = document.getElementById('input-upload-file');
    const btnUploadSave = document.getElementById('btn-upload-save');
    const uploadModeError = document.getElementById('upload-mode-error');
    const uploadModeSuccess = document.getElementById('upload-mode-success');
    const uploadSuccessText = document.getElementById('upload-success-text');
    const linkExitUpload = document.getElementById('link-exit-upload');
    const linkGoExport = document.getElementById('link-go-export');

    // --- Referencias DOM (Modo Exportar) ---
    const exportModeContainer = document.getElementById('export-mode-container');
    const exportSubjectTitle = document.getElementById('export-subject-title');
    const exportThumbnailsGrid = document.getElementById('export-thumbnails-grid');
    const exportEmptyState = document.getElementById('export-empty-state');
    const btnBackToUpload = document.getElementById('btn-back-to-upload');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');

    // ==========================================
    // INICIALIZACIÓN DE LA APP
    // ==========================================
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Usuario logueado
            enterApp();
        } else {
            // Usuario no logueado
            if(authContainer) authContainer.style.display = 'flex';
            if(appContainer) appContainer.style.display = 'none';
            blockLogin.style.display = 'block';
            blockCreatePassword.style.display = 'none'; // Mostrar solo login por defecto
        }
    });

    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        if (authCard && (element === createError || element === loginError)) {
            authCard.classList.remove('shake');
            void authCard.offsetWidth; 
            authCard.classList.add('shake');
        }
    }

    function clearError(element) {
        element.style.display = 'none';
        element.textContent = '';
    }

    async function enterApp() {
        if(authContainer) authContainer.style.display = 'none';
        
        try {
            // initDB ya no es necesario, Firebase se inicializa globalmente
            
            const params = new URLSearchParams(window.location.search);
            const materiaId = params.get('materia');
            const modo = params.get('modo');
            const materiaNombre = params.get('nombre');

            if (modo === 'subir' && materiaId) {
                // Modo subir
                uploadModeContainer.style.display = 'flex';
                await initUploadMode(materiaId, materiaNombre);
            } else {
                // Modo normal
                appContainer.style.display = 'flex';
                await loadSubjects();
            }
        } catch (e) {
            alert("Hubo un error crítico conectando con la base de datos local.");
        }
    }


    // ==========================================
    // LÓGICA DE AUTENTICACIÓN
    // ==========================================
    btnSave.addEventListener('click', async () => {
        clearError(createError);
        const email = inputNewEmail.value;
        const p1 = inputNewPassword.value;
        const p2 = inputConfirmPassword.value;
        
        if (!email || !p1 || !p2) return showError(createError, 'Completa todos los campos.');
        if (p1 !== p2) return showError(createError, 'Las contraseñas no coinciden.');
        if (p1.length < 6) return showError(createError, 'La contraseña debe tener 6 caracteres.');
        
        try {
            await createUserWithEmailAndPassword(auth, email, p1);
            // Firebase Auth dispara onAuthStateChanged que llama enterApp()
        } catch (error) {
            showError(createError, 'Error: ' + error.message);
        }
    });

    btnLogin.addEventListener('click', async () => {
        clearError(loginError);
        const email = inputLoginEmail.value;
        const p = inputLoginPassword.value;
        
        if (!email || !p) return showError(loginError, 'Ingresa correo y contraseña.');
        
        try {
            await signInWithEmailAndPassword(auth, email, p);
            // Firebase Auth dispara onAuthStateChanged que llama enterApp()
        } catch (error) {
            showError(loginError, 'Credenciales incorrectas.');
            inputLoginPassword.value = ''; inputLoginPassword.focus();
        }
    });

    inputLoginPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnLogin.click(); });

    if (linkToRegister) {
        linkToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            blockLogin.style.display = 'none';
            blockCreatePassword.style.display = 'block';
        });
    }

    if (linkToLogin) {
        linkToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            blockCreatePassword.style.display = 'none';
            blockLogin.style.display = 'block';
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
            appContainer.style.display = 'none';
            if(authContainer) authContainer.style.display = 'block';
        });
    }


    // ==========================================
    // LÓGICA DE MATERIAS
    // ==========================================
    async function loadSubjects() {
        try {
            subjects = await getSubjectsDB();
        } catch(e) {
            subjects = [];
        }
        renderSubjects();
        if (subjects.length > 0) {
            if (!activeSubjectId || !subjects.find(s => s.id === activeSubjectId)) setActiveSubject(subjects[0].id);
            else setActiveSubject(activeSubjectId);
        } else {
            activeSubjectId = null;
            showEmptyState();
        }
    }

    function renderSubjects() {
        subjectList.innerHTML = '';
        subjects.forEach(subject => {
            const li = document.createElement('li');
            li.className = `subject-item ${subject.id === activeSubjectId ? 'active' : ''}`;
            li.textContent = subject.name;
            li.addEventListener('click', () => setActiveSubject(subject.id));
            subjectList.appendChild(li);
        });
    }

    function setActiveSubject(id) {
        activeSubjectId = id;
        const items = subjectList.querySelectorAll('.subject-item');
        items.forEach((item, index) => {
            if (subjects[index].id === id) item.classList.add('active');
            else item.classList.remove('active');
        });

        const subject = subjects.find(s => s.id === id);
        if (subject) {
            emptySubjectsState.style.display = 'none';
            activeSubjectPanel.style.display = 'block';
            activeSubjectTitle.textContent = subject.name;
            loadNotes(id); // Cargar apuntes
        }
    }

    function showEmptyState() {
        activeSubjectPanel.style.display = 'none';
        emptySubjectsState.style.display = 'flex';
    }

    btnNewSubject.addEventListener('click', () => {
        inputSubjectName.value = '';
        clearError(modalError);
        modalNewSubject.style.display = 'flex';
        setTimeout(() => inputSubjectName.focus(), 100);
    });
    btnCancelSubject.addEventListener('click', () => modalNewSubject.style.display = 'none');

    btnSaveSubject.addEventListener('click', async () => {
        const name = inputSubjectName.value.trim();
        if (!name) return showError(modalError, 'Escribe un nombre.');
        const newSubject = { id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7), name: name };
        try {
            await saveSubjectDB(newSubject);
            subjects.push(newSubject);
            modalNewSubject.style.display = 'none';
            renderSubjects();
            setActiveSubject(newSubject.id);
            // Mostrar el modal de QR para la nueva materia
            showSubjectQr(newSubject.id, newSubject.name);
        } catch(e) {
            showError(modalError, 'Error al guardar en base de datos.');
        }
    });

    inputSubjectName.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnSaveSubject.click(); });

    btnDeleteSubject.addEventListener('click', async () => {
        if (!activeSubjectId) return;
        const subject = subjects.find(s => s.id === activeSubjectId);
        if (confirm(`¿Estás seguro que deseas eliminar la materia "${subject.name}" y TODOS sus apuntes?`)) {
            try {
                await deleteSubjectAndApuntesDB(activeSubjectId);
                subjects = subjects.filter(s => s.id !== activeSubjectId);
                if (subjects.length > 0) {
                    setActiveSubject(subjects[0].id);
                    renderSubjects();
                } else {
                    activeSubjectId = null;
                    renderSubjects();
                    showEmptyState();
                }
            } catch(e) {
                alert("Ocurrió un error al intentar borrar la materia.");
            }
        }
    });

    // ==========================================
    // LÓGICA DE APUNTES
    // ==========================================
    async function loadNotes(materiaId) {
        try {
            const apuntes = await getApuntesDB(materiaId);
            renderNotes(apuntes);
        } catch (e) {
            console.error("Error al cargar apuntes:", e);
            alert("No se pudieron cargar los apuntes de la base de datos.");
        }
    }

    function renderNotes(apuntes) {
        notesGrid.innerHTML = '';
        
        if (apuntes.length === 0) {
            emptyNotesState.style.display = 'flex';
            notesGrid.style.display = 'none';
            return;
        }
        
        emptyNotesState.style.display = 'none';
        notesGrid.style.display = 'grid';
        
        // Ordenar del más reciente al más antiguo
        apuntes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        
        apuntes.forEach(apunte => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.setAttribute('data-type', apunte.tipo);
            
            const isPdf = apunte.tipo === 'pdf';
            const iconClass = isPdf ? 'fa-solid fa-file-pdf' : 'fa-regular fa-image';
            const dateStr = new Date(apunte.fecha).toLocaleDateString();
            
            const sizeStr = formatBytes(apunte.size || 0);
            
            card.innerHTML = `
                <div class="note-icon"><i class="${iconClass}"></i></div>
                <div class="note-title" title="${apunte.titulo}">${apunte.titulo}</div>
                <div class="note-meta">
                    <span>${dateStr}</span>
                    <span>${sizeStr}</span>
                </div>
                <div class="note-actions">
                    <button class="btn btn-secondary btn-sm view-btn" style="flex:1;">Ver</button>
                    <button class="btn btn-danger btn-sm delete-btn" title="Borrar"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            
            // Evento Ver
            card.querySelector('.view-btn').addEventListener('click', () => {
                const win = window.open();
                if (win) {
                    if(isPdf) {
                        win.document.write(`<iframe src="${apunte.downloadURL}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%; position:absolute;"></iframe>`);
                    } else {
                        win.document.write(`<body style="margin:0;display:flex;justify-content:center;align-items:center;background:#111;min-height:100vh;"><img src="${apunte.downloadURL}" style="max-width:100%;max-height:100vh;"></body>`);
                    }
                } else {
                    alert("Por favor habilita las ventanas emergentes (pop-ups) en tu navegador para ver el archivo.");
                }
            });
            
            // Evento Borrar
            card.querySelector('.delete-btn').addEventListener('click', async () => {
                if (confirm(`¿Borrar el apunte "${apunte.titulo}" definitivamente?`)) {
                    try {
                        await deleteApunteDB(apunte.id);
                        loadNotes(activeSubjectId); // Recargar
                    } catch (e) {
                        alert("Error al borrar el apunte.");
                    }
                }
            });
            
            notesGrid.appendChild(card);
        });
    }

    // Modal Nuevo Apunte
    btnAddNote.addEventListener('click', () => {
        if (!activeSubjectId) return;
        inputNoteTitle.value = '';
        inputNoteFile.value = '';
        clearError(noteModalError);
        modalNewNote.style.display = 'flex';
        inputNoteTitle.focus();
    });

    btnCancelNote.addEventListener('click', () => modalNewNote.style.display = 'none');

    btnSaveNote.addEventListener('click', async () => {
        const title = inputNoteTitle.value.trim();
        const files = inputNoteFile.files;
        
        if (!title) return showError(noteModalError, 'Escribe un título para el apunte.');
        if (files.length === 0) return showError(noteModalError, 'Selecciona al menos un archivo (JPG, PNG o PDF).');

        // Cierra el modal y muestra el loader
        modalNewNote.style.display = 'none';
        globalLoader.style.display = 'flex';

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const isPdf = file.type === 'application/pdf';
                const isImage = file.type.startsWith('image/');

                if (!isPdf && !isImage) {
                    alert(`Formato no soportado en archivo: ${file.name}`);
                    continue; // Saltar archivos no válidos
                }

                let fileOrBase64 = file;
                let approxBytes = file.size;
                
                if (isImage) {
                    // Comprimimos la imagen localmente
                    fileOrBase64 = await compressImage(file);
                    approxBytes = Math.round((fileOrBase64.length * 3) / 4);
                }
                
                // Subir a Cloudinary
                const secureUrl = await uploadToCloudinary(fileOrBase64);
                
                const finalTitle = files.length > 1 ? `${title} (${i + 1})` : title;

                const newApunte = {
                    id: 'apt_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                    materiaId: activeSubjectId,
                    titulo: finalTitle,
                    tipo: isPdf ? 'pdf' : 'image',
                    fecha: new Date().toISOString(),
                    size: approxBytes,
                    downloadURL: secureUrl
                };

                await saveApunteDB(newApunte);
            }
            loadNotes(activeSubjectId); // Recargar interfaz
        } catch (e) {
            console.error("Error guardando apunte:", e);
            alert("Error procesando o guardando los archivos. Verifica tu conexión.");
            // Restaurar modal en caso de fallo
            modalNewNote.style.display = 'flex'; 
        } finally {
            globalLoader.style.display = 'none';
        }
    });

    // ==========================================
    // LÓGICA DE CÓDIGO QR POR MATERIA
    // ==========================================
    let currentQrCode = null;

    function showSubjectQr(materiaId, materiaName) {
        modalSubjectQr.style.display = 'flex';
        subjectQrName.textContent = materiaName;
        subjectQrContainer.innerHTML = '';
        
        const baseUrl = window.location.origin + window.location.pathname;
        const qrUrl = `${baseUrl}?materia=${materiaId}&nombre=${encodeURIComponent(materiaName)}&modo=subir`;

        currentQrCode = new QRCode(subjectQrContainer, {
            text: qrUrl,
            width: 200,
            height: 200,
            colorDark : "#111111",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }

    btnShowSubjectQr.addEventListener('click', () => {
        if (!activeSubjectId) return;
        const subject = subjects.find(s => s.id === activeSubjectId);
        if (subject) {
            showSubjectQr(subject.id, subject.name);
        }
    });

    btnCloseSubjectQr.addEventListener('click', () => {
        modalSubjectQr.style.display = 'none';
    });

    btnDownloadSubjectQr.addEventListener('click', () => {
        const canvas = subjectQrContainer.querySelector('canvas');
        let imgURI;
        
        if (canvas) {
            imgURI = canvas.toDataURL("image/png");
        } else {
            const img = subjectQrContainer.querySelector('img');
            if (img && img.src) {
                imgURI = img.src;
            }
        }

        if (imgURI) {
            const link = document.createElement("a");
            const safeName = subjectQrName.textContent.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `qr-${safeName}.png`;
            link.href = imgURI;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert("El código QR no se ha generado correctamente aún.");
        }
    });

    // ==========================================
    // LÓGICA DE MODO SUBIR (Desde QR)
    // ==========================================
    let uploadMateria = null;

    async function initUploadMode(materiaId, materiaNombre) {
        try {
            const subjectsDb = await getSubjectsDB();
            uploadMateria = subjectsDb.find(s => s.id === materiaId);
            
            if (!uploadMateria && materiaNombre) {
                // Si la materia no existe en este dispositivo (ej. celular), se auto-crea
                const newMateria = { id: materiaId, name: materiaNombre };
                await saveSubjectDB(newMateria);
                uploadMateria = newMateria;
            } else if (!uploadMateria) {
                showError(uploadModeError, "Error: La materia no existe o fue eliminada.");
                inputUploadTitle.disabled = true;
                inputUploadFile.disabled = true;
                btnUploadSave.disabled = true;
                uploadSubjectTitle.textContent = "Materia no encontrada";
                return;
            }
            
            uploadSubjectTitle.textContent = uploadMateria.name;
        } catch (e) {
            showError(uploadModeError, "Error al cargar la materia.");
        }
    }

    if (btnUploadSave) {
        btnUploadSave.addEventListener('click', async () => {
            if (!uploadMateria) return;
            
            const title = inputUploadTitle.value.trim();
            const files = inputUploadFile.files;
            
            if (!title) return showError(uploadModeError, 'Escribe un título para el apunte.');
            if (files.length === 0) return showError(uploadModeError, 'Selecciona al menos un archivo (JPG, PNG o PDF).');

            clearError(uploadModeError);
            uploadModeSuccess.style.display = 'none';
            globalLoader.style.display = 'flex';

            try {
                let successCount = 0;
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const isPdf = file.type === 'application/pdf';
                    const isImage = file.type.startsWith('image/');

                    if (!isPdf && !isImage) {
                        alert(`Formato no soportado en archivo: ${file.name}`);
                        continue;
                    }

                    let fileOrBase64 = file;
                    let approxBytes = file.size;
                    
                    if (isImage) {
                        fileOrBase64 = await compressImage(file);
                        approxBytes = Math.round((fileOrBase64.length * 3) / 4);
                    }
                    
                    const secureUrl = await uploadToCloudinary(fileOrBase64);
                    
                    const finalTitle = files.length > 1 ? `${title} (${i + 1})` : title;

                    const newApunte = {
                        id: 'apt_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                        materiaId: uploadMateria.id,
                        titulo: finalTitle,
                        tipo: isPdf ? 'pdf' : 'image',
                        fecha: new Date().toISOString(),
                        size: approxBytes,
                        downloadURL: secureUrl
                    };

                    await saveApunteDB(newApunte);
                    successCount++;
                }

                if (successCount > 0) {
                    inputUploadTitle.value = '';
                    inputUploadFile.value = '';
                    const textSuccess = successCount === 1 ? 'Apunte guardado' : `${successCount} apuntes guardados`;
                    document.getElementById('upload-success-text').textContent = `${textSuccess} correctamente en "${uploadMateria.name}"`;
                    uploadModeSuccess.style.display = 'block';
                    
                    setTimeout(() => {
                        uploadModeSuccess.style.display = 'none';
                    }, 4000);
                }
            } catch (e) {
                console.error("Error guardando apunte en modo subir:", e);
                showError(uploadModeError, "Error procesando o guardando el archivo. Intenta de nuevo.");
            } finally {
                globalLoader.style.display = 'none';
            }
        });
    }

    if (linkExitUpload) {
        linkExitUpload.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = window.location.origin + window.location.pathname;
        });
    }

    if (linkGoExport) {
        linkGoExport.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!uploadMateria) return;
            uploadModeContainer.style.display = 'none';
            exportModeContainer.style.display = 'flex';
            exportSubjectTitle.textContent = uploadMateria.name;
            await renderExportThumbnails(uploadMateria.id);
        });
    }

    if (btnBackToUpload) {
        btnBackToUpload.addEventListener('click', () => {
            exportModeContainer.style.display = 'none';
            uploadModeContainer.style.display = 'flex';
        });
    }

    // ==========================================
    // LÓGICA DE EXPORTACIÓN (pdf-lib)
    // ==========================================
    async function renderExportThumbnails(materiaId) {
        try {
            const apuntes = await getApuntesDB(materiaId);
            exportThumbnailsGrid.innerHTML = '';
            
            if (apuntes.length === 0) {
                exportEmptyState.style.display = 'block';
                exportThumbnailsGrid.style.display = 'none';
                btnDownloadPdf.disabled = true;
                return;
            }
            
            exportEmptyState.style.display = 'none';
            exportThumbnailsGrid.style.display = 'grid';
            btnDownloadPdf.disabled = false;
            
            // Orden cronológico (más antiguo a más reciente)
            apuntes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            
            apuntes.forEach((apunte, index) => {
                const card = document.createElement('div');
                card.className = 'note-card';
                card.style.padding = '10px';
                
                const isPdf = apunte.tipo === 'pdf';
                const iconClass = isPdf ? 'fa-solid fa-file-pdf' : 'fa-regular fa-image';
                
                // Mostrar pequeña previsualización si es imagen
                let previewHtml = `<div class="note-icon" style="margin: 10px 0;"><i class="${iconClass}"></i></div>`;
                if (!isPdf) {
                    previewHtml = `<div style="height: 80px; overflow: hidden; margin-bottom: 10px; border-radius: 4px; display: flex; align-items: center; justify-content: center; background: #000;">
                                     <img src="${apunte.downloadURL}" style="max-width: 100%; max-height: 100%;">
                                   </div>`;
                }
                
                card.innerHTML = `
                    <div style="font-size: 0.75rem; color: var(--accent-yellow); margin-bottom: 5px;">Página ${index + 1}</div>
                    ${previewHtml}
                    <div class="note-title" style="font-size: 0.9rem;" title="${apunte.titulo}">${apunte.titulo}</div>
                `;
                
                exportThumbnailsGrid.appendChild(card);
            });
        } catch(e) {
            console.error(e);
            alert("Error cargando apuntes para exportar.");
        }
    }

    if (btnDownloadPdf) {
        btnDownloadPdf.addEventListener('click', async () => {
            if (!uploadMateria) return;
            
            globalLoader.style.display = 'flex';
            
            try {
                const apuntes = await getApuntesDB(uploadMateria.id);
                apuntes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                
                // Inicializar PDF usando pdf-lib
                const { PDFDocument } = PDFLib;
                const pdfDoc = await PDFDocument.create();
                
                for (const apunte of apuntes) {
                    try {
                        const response = await fetch(apunte.downloadURL);
                        const arrayBuffer = await response.arrayBuffer();

                        if (apunte.tipo === 'image') {
                            // Es una imagen, incrustarla en una nueva página A4
                            const page = pdfDoc.addPage([595.28, 841.89]); // A4 en puntos
                            const { width, height } = page.getSize();
                            
                            let imgEmbed;
                            // Intentamos embeber como jpg, si falla probamos png
                            try {
                                imgEmbed = await pdfDoc.embedJpg(arrayBuffer);
                            } catch (e) {
                                imgEmbed = await pdfDoc.embedPng(arrayBuffer);
                            }
                            
                            const imgDims = imgEmbed.scaleToFit(width - 40, height - 40); // 20pt de margen por lado
                            
                            // Centrar imagen
                            page.drawImage(imgEmbed, {
                                x: width / 2 - imgDims.width / 2,
                                y: height / 2 - imgDims.height / 2,
                                width: imgDims.width,
                                height: imgDims.height
                            });
                            
                        } else if (apunte.tipo === 'pdf') {
                            // Es un PDF, cargar y copiar todas sus páginas
                            const pdfToMerge = await PDFDocument.load(arrayBuffer);
                            const copiedPages = await pdfDoc.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                            
                            copiedPages.forEach((page) => {
                                pdfDoc.addPage(page);
                            });
                        }
                    } catch(err) {
                        console.warn("No se pudo incrustar el apunte", apunte.titulo, err);
                    }
                }
                
                const pdfBytes = await pdfDoc.save();
                
                // Descargar el PDF
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                const safeName = uploadMateria.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                link.download = `${safeName}-apuntes-completos.pdf`;
                link.click();
                
            } catch (e) {
                console.error(e);
                alert("Error al generar el PDF. Revisa la memoria disponible.");
            } finally {
                globalLoader.style.display = 'none';
            }
        });
    }

});
