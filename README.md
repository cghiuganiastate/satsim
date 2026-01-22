# Satellite Simulator Readme
Here you will find the links to go to the satellite simulator:

[Main Satellite Simulator](https://cghiuganiastate.github.io/satsim/)

Here is the link to the spacecraft editor where you can setup your spacecraft:

[Spacecraft Editor](https://cghiuganiastate.github.io/satsim/editor/)

# User Guide
## Satellite Simulator
When you first start the satellite simulator, you should see a screen which gives you the option to load your spacecraft .stl file, your docking port .stl file, your config .json file, and your docking .json file. Or you can press the button to start the simulation using the default model and config to play around with it.

Once you are in, you can find the controls in the bottom left corner. Your state is in the top right corner.  If you are in orbit or selfie stick camera mode, you can left click and drag to move the camera around, and scroll to zoom. This webapp uses the backtick key as its modifier. This is usually to the left of the 1 key, and shared with the ~ key. WASDQE for translation and IJKLUO for rotations. C changes camera modes, V turns the lights on and off. Caps Lock will turn on fine control mode. T lets you switch between using your thrusters, reaction wheels or control moment gyroscopes for attitude control.

You start paused. Return to your starting location and orientation after leaving the docking area to redock. Once you are docked, the game will pause, to unpause/undock press \`+P. For ease of use \`+F is also bound to undock.

## Editor
The editor is where you will be setting up your Model, Thrusters, Cameras, CMGs and RWs, and Lights. All units are in metric. This may be updated in the future.

The camera is an orbit camera, you can left click and drag to move the camera around, and scroll to zoom. When importing STLs from solidworks, you may need to scale them by .001, if so please check that box there to scale your model into meters.

The editor has little bugs where visualizations dont update unless you turn stuff off and on again. Please take note of this.

### Export/Import
You can resume editing your config by importing it, and you can export it to save it and edit it later. 

### Thrusters
Custom keybinds for thrusters arent implemented yet in the main app(if you're feeling brave, open a PR), so use the autobind checkbox to see what your controls will be. Good luck. 

### Attitude
CMGs are wrongly implemented, this will be fixed at some later point in time. Also the postions of reaction wheels have no effect so those lines may be left blank. Also, I think if your reaction wheels are not orthogonal or you have more than 3, the simulation may freak out. This may also happen if you have more than 1 CMG, I haven't tested it. Please let me know if this happens.

# Problems
If you have any problems, or suggestions for improvements, please let me know. 

Good luck and have fun.

