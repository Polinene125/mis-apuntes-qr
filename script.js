// script.js
// Mis Apuntes QR - Lógica principal

const DB_NAME = 'apuntesQR';
const DB_VERSION = 1;
let db = null;

// ==========================================
// DB & CRYPTO FUNCIONES
// ==========================================
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('materias')) {
                database.createObjectStore('materias', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('apuntes')) {
                const apuntesStore = database.createObjectStore('apuntes', { keyPath: 'id' });
                apuntesStore.createIndex('materiaId', 'materiaId', { unique: false });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = (e) => reject(e);
    });
}

function getSubjectsDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['materias'], 'readonly');
        const store = transaction.objectStore('materias');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

function saveSubjectDB(subject) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['materias'], 'readwrite');
        const store = transaction.objectStore('materias');
        const request = store.put(subject);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
}

function deleteSubjectAndApuntesDB(materiaId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['materias', 'apuntes'], 'readwrite');
        transaction.objectStore('materias').delete(materiaId);
        
        const apuntesStore = transaction.objectStore('apuntes');
        const getApuntesRequest = apuntesStore.index('materiaId').getAllKeys(IDBKeyRange.only(materiaId));
        
        getApuntesRequest.onsuccess = () => {
            getApuntesRequest.result.forEach(key => apuntesStore.delete(key));
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e);
    });
}

function getApuntesDB(materiaId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['apuntes'], 'readonly');
        const store = transaction.objectStore('apuntes');
        const index = store.index('materiaId');
        const request = index.getAll(IDBKeyRange.only(materiaId));
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

function saveApunteDB(apunte) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['apuntes'], 'readwrite');
        const store = transaction.objectStore('apuntes');
        const request = store.put(apunte);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
}

function deleteApunteDB(apunteId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['apuntes'], 'readwrite');
        const store = transaction.objectStore('apuntes');
        const request = store.delete(apunteId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
                
                const MAX_WIDTH = 1600;
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Comprimir a JPEG con calidad 0.7
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
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
    const inputNewPassword = document.getElementById('new-password');
    const inputConfirmPassword = document.getElementById('confirm-password');
    const inputLoginPassword = document.getElementById('login-password');
    const createError = document.getElementById('create-error');
    const loginError = document.getElementById('login-error');
    const linkForgot = document.getElementById('link-forgot');
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
    const storedHash = localStorage.getItem('mis_apuntes_pwd_hash');
    if (storedHash) blockLogin.style.display = 'block';
    else blockCreatePassword.style.display = 'block';

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
            if (!db) await initDB();
            
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
        const p1 = inputNewPassword.value;
        const p2 = inputConfirmPassword.value;
        if (!p1 || !p2) return showError(createError, 'Por favor completa ambos campos.');
        if (p1 !== p2) return showError(createError, 'Las contraseñas no coinciden.');
        if (p1.length < 4) return showError(createError, 'La contraseña es muy corta.');
        const hash = await hashPassword(p1);
        localStorage.setItem('mis_apuntes_pwd_hash', hash);
        inputNewPassword.value = ''; inputConfirmPassword.value = '';
        enterApp();
    });

    btnLogin.addEventListener('click', async () => {
        clearError(loginError);
        const p = inputLoginPassword.value;
        if (!p) return showError(loginError, 'Ingresa tu contraseña.');
        const currentHash = localStorage.getItem('mis_apuntes_pwd_hash');
        const inputHash = await hashPassword(p);
        if (inputHash === currentHash) {
            inputLoginPassword.value = '';
            enterApp();
        } else {
            showError(loginError, 'Contraseña incorrecta.');
            inputLoginPassword.value = ''; inputLoginPassword.focus();
        }
    });

    inputLoginPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnLogin.click(); });

    if (linkForgot) {
        linkForgot.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm("¿Estás seguro que deseas borrar tu contraseña? Esto eliminará también todos tus apuntes e imágenes.")) {
                if (confirm("¡ATENCIÓN! Esta acción es irreversible. ¿Confirmas borrar todo el almacenamiento local?")) {
                    localStorage.clear();
                    const req = indexedDB.deleteDatabase(DB_NAME);
                    req.onsuccess = () => location.reload();
                    req.onerror = () => location.reload();
                    req.onblocked = () => location.reload();
                }
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
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
            
            // Estimar tamaño desde base64 (muy aproximado)
            const approxBytes = Math.round((apunte.dataBase64.length * 3) / 4);
            const sizeStr = formatBytes(approxBytes);
            
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
                        win.document.write(`<iframe src="${apunte.dataBase64}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%; position:absolute;"></iframe>`);
                    } else {
                        win.document.write(`<body style="margin:0;display:flex;justify-content:center;align-items:center;background:#111;min-height:100vh;"><img src="${apunte.dataBase64}" style="max-width:100%;max-height:100vh;"></body>`);
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
        const file = inputNoteFile.files[0];
        
        if (!title) return showError(noteModalError, 'Escribe un título para el apunte.');
        if (!file) return showError(noteModalError, 'Selecciona un archivo (JPG, PNG o PDF).');

        const isPdf = file.type === 'application/pdf';
        const isImage = file.type.startsWith('image/');

        if (!isPdf && !isImage) {
            return showError(noteModalError, 'Formato no soportado. Solo JPG, PNG o PDF.');
        }

        if (isPdf && file.size > 8 * 1024 * 1024) {
            return showError(noteModalError, 'El PDF es muy pesado. Máximo 8MB.');
        }

        // Cierra el modal y muestra el loader
        modalNewNote.style.display = 'none';
        globalLoader.style.display = 'flex';

        try {
            let dataBase64 = '';
            
            if (isImage) {
                dataBase64 = await compressImage(file);
            } else {
                dataBase64 = await fileToBase64(file);
            }
            
            const newApunte = {
                id: 'apt_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                materiaId: activeSubjectId,
                titulo: title,
                tipo: isPdf ? 'pdf' : 'image',
                fecha: new Date().toISOString(),
                dataBase64: dataBase64
            };

            await saveApunteDB(newApunte);
            loadNotes(activeSubjectId); // Recargar interfaz
            
        } catch (e) {
            console.error("Error guardando apunte:", e);
            alert("Error procesando o guardando el archivo. Asegúrate que no esté corrupto y que tengas espacio libre en el disco.");
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
            const file = inputUploadFile.files[0];
            
            if (!title) return showError(uploadModeError, 'Escribe un título para el apunte.');
            if (!file) return showError(uploadModeError, 'Selecciona un archivo (JPG, PNG o PDF).');

            const isPdf = file.type === 'application/pdf';
            const isImage = file.type.startsWith('image/');

            if (!isPdf && !isImage) {
                return showError(uploadModeError, 'Formato no soportado. Solo JPG, PNG o PDF.');
            }

            if (isPdf && file.size > 8 * 1024 * 1024) {
                return showError(uploadModeError, 'El PDF es muy pesado. Máximo 8MB.');
            }

            clearError(uploadModeError);
            uploadModeSuccess.style.display = 'none';
            globalLoader.style.display = 'flex';

            try {
                let dataBase64 = '';
                
                if (isImage) {
                    dataBase64 = await compressImage(file);
                } else {
                    dataBase64 = await fileToBase64(file);
                }
                
                const newApunte = {
                    id: 'apt_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
                    materiaId: uploadMateria.id,
                    titulo: title,
                    tipo: isPdf ? 'pdf' : 'image',
                    fecha: new Date().toISOString(),
                    dataBase64: dataBase64
                };

                await saveApunteDB(newApunte);
                
                // Limpiar formulario y mostrar éxito
                inputUploadTitle.value = '';
                inputUploadFile.value = '';
                uploadSuccessText.textContent = `Apunte guardado en ${uploadMateria.name}`;
                uploadModeSuccess.style.display = 'block';
                
                // Ocultar mensaje de éxito después de unos segundos
                setTimeout(() => {
                    uploadModeSuccess.style.display = 'none';
                }, 4000);
                
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
                                     <img src="${apunte.dataBase64}" style="max-width: 100%; max-height: 100%;">
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
                    if (apunte.tipo === 'image') {
                        // Es una imagen, incrustarla en una nueva página A4
                        const page = pdfDoc.addPage([595.28, 841.89]); // A4 en puntos
                        const { width, height } = page.getSize();
                        
                        let imgEmbed;
                        // Determinar si es jpeg o png desde el base64
                        if (apunte.dataBase64.startsWith('data:image/png')) {
                            imgEmbed = await pdfDoc.embedPng(apunte.dataBase64);
                        } else {
                            // Por defecto tratamos como JPEG
                            imgEmbed = await pdfDoc.embedJpg(apunte.dataBase64);
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
                        const existingPdfBytes = apunte.dataBase64;
                        // pdf-lib requiere ArrayBuffer o Uint8Array para cargar PDFs base64
                        const pdfToMerge = await PDFDocument.load(existingPdfBytes);
                        const copiedPages = await pdfDoc.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                        
                        copiedPages.forEach((page) => {
                            pdfDoc.addPage(page);
                        });
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
