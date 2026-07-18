// EmailJS Configuration
const serviceID = 'service_khrpnrm';
const templateID = 'template_kjxepli';

emailjs.init({
    publicKey: '5VRVlPsLVUbn81VK9'
});

// Mobile Menu Functions
function toggleMobileMenu() {
    const mobileNav = document.getElementById('mobileNav');
    mobileNav.classList.toggle('active');
}

function closeMobileMenu() {
    const mobileNav = document.getElementById('mobileNav');
    mobileNav.classList.remove('active');
}

// Intersection Observer for Service Cards Animation
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
        setTimeout(() => {
        entry.target.classList.add('visible');
        }, index * 150);
        observer.unobserve(entry.target);
    }
    });
}, observerOptions);

// Form Submission Handler
function handleFormSubmission() {
    const form = document.getElementById('appointmentForm');
    
    form.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    
    if (!email && !phone) {
        alert("Kérjük, adjon meg legalább egy elérhetőséget: email vagy telefonszám.");
        return;
    }
    
    const submitButton = form.querySelector('.form__button');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Küldés...';
    submitButton.disabled = true;
    
    emailjs.sendForm(serviceID, templateID, form)
        .then(() => {
        alert("Kérését megkaptuk, és mihamarabb válaszolunk!");
        form.reset();
        })
        .catch((error) => {
        alert("Hiba történt az elküldés során. Kérem, próbálja újra.");
        console.error('EmailJS error:', error);
        })
        .finally(() => {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
        });
    });
}

// Smooth scrolling for navigation links
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const href = this.getAttribute('href');
        
        // Special handling for home and about links to go to very top
        if (href === '#home' || href === '#about') {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        return;
        }
        
        const target = document.querySelector(href);
        if (target) {
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
        }
    });
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Observe service cards for animation
    document.querySelectorAll('.service__card').forEach(card => {
    observer.observe(card);
    });
    
    // Initialize form handling
    handleFormSubmission();
    
    // Initialize smooth scrolling
    initSmoothScrolling();
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
    const mobileNav = document.getElementById('mobileNav');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    
    if (!mobileNav.contains(e.target) && !menuToggle.contains(e.target)) {
        mobileNav.classList.remove('active');
    }
    });
});