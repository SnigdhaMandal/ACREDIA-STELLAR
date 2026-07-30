(function() {
    // Acredia Verification Widget
    // Usage: Include this script and add a container to your HTML
    // <div id="acredia-verify-widget" data-token="optional-credential-token"></div>

    function initWidget() {
        var container = document.getElementById('acredia-verify-widget');
        if (!container) return;

        var token = container.getAttribute('data-token') || '';
        
        // Host determination
        var scripts = document.getElementsByTagName('script');
        var scriptSrc = '';
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src.indexOf('widget.js') > -1) {
                scriptSrc = scripts[i].src;
                break;
            }
        }
        var baseUrl = scriptSrc ? new URL(scriptSrc).origin : 'https://acredia-stellar.vercel.app';

        var button = document.createElement('button');
        button.style.backgroundColor = '#1d4ed8';
        button.style.color = '#ffffff';
        button.style.border = 'none';
        button.style.padding = '10px 20px';
        button.style.borderRadius = '6px';
        button.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        button.style.display = 'inline-flex';
        button.style.alignItems = 'center';
        button.style.gap = '8px';
        button.style.transition = 'background-color 0.2s';

        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Verify with Acredia';

        button.addEventListener('mouseover', function() {
            button.style.backgroundColor = '#1e40af';
        });
        button.addEventListener('mouseout', function() {
            button.style.backgroundColor = '#1d4ed8';
        });

        button.onclick = function(e) {
            e.preventDefault();
            var url = baseUrl + '/verify' + (token ? '/' + encodeURIComponent(token) : '');
            var width = 600;
            var height = 750;
            var left = (window.screen.width / 2) - (width / 2);
            var top = (window.screen.height / 2) - (height / 2);
            window.open(url, 'AcrediaVerify', 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left + ',toolbar=no,menubar=no,scrollbars=yes,resizable=yes');
        };

        container.appendChild(button);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget);
    } else {
        initWidget();
    }
})();
