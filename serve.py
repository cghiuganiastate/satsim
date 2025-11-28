import os
import re
import http.server
import socketserver
import sys
import time
import threading

# --- Configuration ---
PORT = 8000
FILE_PREFIX = "index"
FILE_SUFFIX = ".html"
CHECK_INTERVAL = 5  # seconds between file update checks

# --- 1. Find the file with the highest number ---
def find_highest_version_file():
    """
    Searches the current directory for files matching the pattern
    and returns the one with the highest numerical suffix.
    """
    max_num = -1
    target_filename = None

    # Use a regular expression to find the number in the filename
    pattern = re.compile(rf"^{re.escape(FILE_PREFIX)}(\d+){re.escape(FILE_SUFFIX)}$")

    for filename in os.listdir("."):
        match = pattern.match(filename)
        if match:
            # Extract the number and convert it to an integer
            try:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
                    target_filename = filename
            except ValueError:
                # This should not happen with the regex, but it's good practice
                continue

    return target_filename

# --- 2. Create a custom web server handler ---
class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """
    A custom handler that serves a specific file when the root URL is requested.
    """
    # Class attributes to track the current file and its modification time
    target_file = None
    current_file_mtime = 0
    lock = threading.Lock()
    
    def do_GET(self):
        # If the user requests the root directory, serve our target file
        if self.path == '/':
            # Check if the target file exists before trying to serve it
            with CustomHTTPRequestHandler.lock:
                if os.path.exists(self.target_file):
                    self.path = self.target_file  # Trick the parent class into serving our file
                else:
                    self.send_error(404, f"File Not Found: {self.target_file}")
                    return
        
        # For all other paths, use the default behavior (e.g., serving CSS, JS files)
        super().do_GET()

# --- 3. File update checker ---
def check_for_updates():
    """
    Periodically check for file updates and reload if necessary.
    """
    while True:
        time.sleep(CHECK_INTERVAL)
        
        # Check for a higher numbered file
        new_file = find_highest_version_file()
        
        with CustomHTTPRequestHandler.lock:
            if new_file and new_file != CustomHTTPRequestHandler.target_file:
                print(f"New file detected: {new_file}. Reloading...")
                CustomHTTPRequestHandler.target_file = new_file
                CustomHTTPRequestHandler.current_file_mtime = os.path.getmtime(new_file)
            
            # Check if the current file has been modified
            elif os.path.exists(CustomHTTPRequestHandler.target_file):
                current_mtime = os.path.getmtime(CustomHTTPRequestHandler.target_file)
                if current_mtime != CustomHTTPRequestHandler.current_file_mtime:
                    print(f"File {CustomHTTPRequestHandler.target_file} has been modified. Reloading...")
                    CustomHTTPRequestHandler.current_file_mtime = current_mtime

# --- 4. Main execution block ---
if __name__ == "__main__":
    # Find the initial file to serve
    file_to_serve = find_highest_version_file()

    if not file_to_serve:
        print(f"Error: Could not find any files matching '{FILE_PREFIX}*{FILE_SUFFIX}' in the current directory.")
        sys.exit(1)

    # Set the target file and its initial modification time
    CustomHTTPRequestHandler.target_file = file_to_serve
    CustomHTTPRequestHandler.current_file_mtime = os.path.getmtime(file_to_serve)

    # Start the update checker thread
    update_thread = threading.Thread(target=check_for_updates, daemon=True)
    update_thread.start()

    # Start the server
    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"Serving '{file_to_serve}' at http://localhost:{PORT}")
        print("Press Ctrl+C to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)