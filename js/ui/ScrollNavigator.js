// BEGIN FILE: js/ui/ScrollNavigator.js
export class ScrollNavigator {
    constructor(app) {
        this.app = app;
        this.container = document.getElementById('output-container');
        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        this.navPill = document.createElement('div');
        this.navPill.className = 'floating-nav';
        
        this.btnPrev = document.createElement('button');
        this.btnPrev.innerHTML = '⬆️';
        this.btnPrev.title = 'Previous Assistant Message';
        
        this.btnNext = document.createElement('button');
        this.btnNext.innerHTML = '⬇️';
        this.btnNext.title = 'Next Assistant Message';

        this.navPill.appendChild(this.btnPrev);
        this.navPill.appendChild(this.btnNext);

        document.body.appendChild(this.navPill);
    }

    bindEvents() {
        this.btnPrev.addEventListener('click', () => this.navigate(-1));
        this.btnNext.addEventListener('click', () => this.navigate(1));
    }

    navigate(direction) {
        const turns = Array.from(this.container.querySelectorAll('.turn.assistant'));
        if (turns.length === 0) return;
        
        const containerRect = this.container.getBoundingClientRect();
        let targetTurn = null;

        if (direction === -1) { // Prev
            for (let i = turns.length - 1; i >= 0; i--) {
                const rect = turns[i].getBoundingClientRect();
                // If we are currently scrolled past the top of THIS turn (partially hidden above)
                // jump to the top of THIS turn first, rather than skipping to the previous one.
                if (rect.top < containerRect.top - 15) {
                    targetTurn = turns[i];
                    break;
                }
            }
            // Fallback: if we are slightly scrolled down on the very first message
            if (!targetTurn && turns.length > 0) {
                targetTurn = turns[0];
            }
        } else { // Next
            for (let i = 0; i < turns.length; i++) {
                const rect = turns[i].getBoundingClientRect();
                // Find the first turn whose top is strictly below the container's top
                if (rect.top > containerRect.top + 15) {
                    targetTurn = turns[i];
                    break;
                }
            }
        }

        if (targetTurn) {
            this.container.scrollTop += targetTurn.getBoundingClientRect().top - containerRect.top - 10;
        }
    }
}
// END FILE: js/ui/ScrollNavigator.js