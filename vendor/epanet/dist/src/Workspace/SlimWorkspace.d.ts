import { EpanetEngineAPI as EpanetEngine22 } from '../engines/v2.2/engine-index';
import { EpanetEngineAPI as EpanetEngine23 } from '../engines/v2.3/engine-index';
import { EpanetEngineAPI as EpanetEngine231 } from '../engines/v2.3.1/engine-index';
import { EpanetEngineAPI as EpanetEngine232 } from '../engines/v2.3.2/engine-index';
import { EpanetEngineAPI as EpanetEngine233 } from '../engines/v2.3.3/engine-index';
import { EpanetEngineAPI as EpanetEngine234 } from '../engines/v2.3.4/engine-index';
import { EpanetEngineAPI as EpanetEngine235 } from '../engines/v2.3.5/engine-index';
import { EpanetEngineAPI as EpanetEngineDev } from '../engines/dev/engine-index';
import { EpanetEngineAPI as EpanetEngineMaster } from '../engines/master/engine-index';
import { EpanetEngineAPI as EpanetEngine22MSX } from '../engines/v2.2-msx/engine-index';
import { EpanetEngineAPI as EpanetEngine23MSX } from '../engines/v2.3-msx/engine-index';
import { EpanetEngineAPI as EpanetEngine231MSX } from '../engines/v2.3.1-msx/engine-index';
import { EpanetEngineAPI as EpanetEngine232MSX } from '../engines/v2.3.2-msx/engine-index';
import { EpanetEngineAPI as EpanetEngine233MSX } from '../engines/v2.3.3-msx/engine-index';
import { EpanetEngineAPI as EpanetEngine234MSX } from '../engines/v2.3.4-msx/engine-index';
import { EpanetEngineAPI as EpanetEngine235MSX } from '../engines/v2.3.5-msx/engine-index';
import { EpanetEngineAPI as EpanetEngineDevMSX } from '../engines/dev-msx/engine-index';
import { EpanetEngineAPI as EpanetEngineMasterMSX } from '../engines/master-msx/engine-index';

type EpanetEngine = EpanetEngine22 | EpanetEngine23 | EpanetEngine231 | EpanetEngine232 | EpanetEngine233 | EpanetEngine234 | EpanetEngine234 | EpanetEngine235 | EpanetEngineDev | EpanetEngineMaster | EpanetEngine22MSX | EpanetEngine23MSX | EpanetEngine231MSX | EpanetEngine232MSX | EpanetEngine233MSX | EpanetEngine234MSX | EpanetEngine235MSX | EpanetEngineDevMSX | EpanetEngineMasterMSX;
export declare class Workspace {
    private _instance;
    private _FS;
    loadModuleVersion(epanetEngine: () => Promise<EpanetEngine>): Promise<void>;
    private checkEngineLoaded;
    get isLoaded(): boolean;
    get instance(): NonNullable<typeof this._instance>;
    private get FS();
    get version(): number;
    getError(code: number): string;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(file: string): string;
    readFile(file: string, encoding: "utf8"): string;
    readFile(file: string, encoding: "binary"): Uint8Array;
}
export default Workspace;
