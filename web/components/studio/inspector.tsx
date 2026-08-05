'use client';

import * as React from 'react';
import { formatCurrency, formatCompact } from '@/lib/utils';
import type { AdvancedSettings } from '@/lib/studio/settings';
import type { Preset, Recipe, UsageEstimate } from '@/lib/api/types';
import type { CharacterSlot, StudioMode } from '@/lib/studio/reducer';
import {
  ControlGroup,
  RangeField,
  SelectField,
  StudioLabel,
  StudioInput,
  StudioSelect,
  StudioTextarea,
  ToggleRow,
} from './primitives';

type Patch = (updater: (current: AdvancedSettings) => AdvancedSettings) => void;

/** Option lists mirroring lib/studioSettings.js, with the legacy display copy. */
const FRAMING = [
  ['auto', 'Auto'],
  ['close-up', 'Close-up'],
  ['medium', 'Medium'],
  ['full-body', 'Full body'],
  ['wide', 'Wide'],
] as const;

const ANGLE = [
  ['auto', 'Auto'],
  ['eye-level', 'Eye level'],
  ['low-angle', 'Low angle'],
  ['high-angle', 'High angle'],
  ['overhead', 'Overhead'],
] as const;

const LENS = [
  ['auto', 'Auto'],
  ['24mm', '24mm wide'],
  ['35mm', '35mm natural'],
  ['50mm', '50mm classic'],
  ['85mm', '85mm portrait'],
] as const;

const DEPTH = [
  ['auto', 'Auto'],
  ['shallow', 'Shallow'],
  ['balanced', 'Balanced'],
  ['deep', 'Deep'],
] as const;

const APERTURE = [
  ['auto', 'Auto'],
  ['f/1.8', 'f/1.8'],
  ['f/2.8', 'f/2.8'],
  ['f/4', 'f/4'],
  ['f/8', 'f/8'],
  ['f/11', 'f/11'],
] as const;

const LIGHTING = [
  ['auto', 'Auto match'],
  ['soft-studio', 'Soft studio'],
  ['golden-hour', 'Golden hour'],
  ['window-light', 'Window light'],
  ['dramatic', 'Dramatic contrast'],
  ['overcast', 'Soft overcast'],
] as const;

const TEMPERATURE = [
  ['auto', 'Auto'],
  ['cool', 'Cool'],
  ['neutral', 'Neutral'],
  ['warm', 'Warm'],
] as const;

const TIME_OF_DAY = [
  ['auto', 'Auto'],
  ['morning', 'Morning'],
  ['midday', 'Midday'],
  ['sunset', 'Sunset'],
  ['night', 'Night'],
] as const;

const SPACING = [
  ['auto', 'Auto'],
  ['tight', 'Tight'],
  ['natural', 'Natural'],
  ['airy', 'Airy'],
] as const;

const CROP = [
  ['safe', 'Safe'],
  ['auto', 'Auto'],
  ['dynamic', 'Dynamic'],
  ['extra-headroom', 'Extra headroom'],
] as const;

const SEPARATION = [
  ['auto', 'Auto'],
  ['flat', 'Flat'],
  ['subtle', 'Subtle'],
  ['strong', 'Strong'],
] as const;

const RETOUCH = [
  ['none', 'None'],
  ['natural', 'Natural'],
  ['polished', 'Polished'],
] as const;

const GRADE = [
  ['auto', 'Auto'],
  ['neutral', 'Neutral'],
  ['warm-film', 'Warm film'],
  ['cool-editorial', 'Cool editorial'],
  ['cinematic', 'Cinematic'],
  ['black-and-white', 'Black & white'],
] as const;

const GRAIN = [
  ['none', 'None'],
  ['subtle', 'Subtle'],
  ['medium', 'Medium'],
] as const;

const QUALITY = [
  ['low', 'Draft'],
  ['medium', 'Standard'],
  ['high', 'High'],
] as const;

const RATIOS = [
  ['1:1', 'Square', 'ratio-square'],
  ['4:5', 'Portrait', 'ratio-portrait'],
  ['16:9', 'Wide', 'ratio-wide'],
  ['9:16', 'Story', 'ratio-story'],
] as const;

export interface InspectorProps {
  mode: StudioMode;
  settings: AdvancedSettings;
  patch: Patch;
  slots: CharacterSlot[];
  backgrounds: Preset[];
  styles: Preset[];
  backgroundPresetId: string | null;
  stylePresetId: string | null;
  onPresetChange: (kind: 'background' | 'style', id: string | null) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  recipes: Recipe[];
  activeRecipeId: string;
  onApplyRecipe: (id: string) => void;
  onSaveRecipe: () => void;
  onReset: () => void;
  estimate: UsageEstimate | undefined;
  capabilityNote: string | null;
  onModeChange: (mode: StudioMode) => void;
}

export function Inspector({
  mode,
  settings,
  patch,
  slots,
  backgrounds,
  styles,
  backgroundPresetId,
  stylePresetId,
  onPresetChange,
  instructions,
  onInstructionsChange,
  recipes,
  activeRecipeId,
  onApplyRecipe,
  onSaveRecipe,
  onReset,
  estimate,
  capabilityNote,
  onModeChange,
}: InspectorProps) {
  const advanced = mode === 'advanced';

  return (
    <aside className="studio-panel inspector-panel" aria-label="Creative controls">
      <div className="panel-head">
        <div>
          <span className="panel-kicker">02</span>
          <h2>Direction</h2>
        </div>
        <button type="button" className="reset-button" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="inspector-mode-switch">
        <div className="mode-switch" role="group" aria-label="Studio experience level">
          <button
            type="button"
            className={mode === 'normal' ? 'active' : undefined}
            aria-pressed={mode === 'normal'}
            onClick={() => onModeChange('normal')}
          >
            Normal
          </button>
          <button
            type="button"
            className={mode === 'advanced' ? 'active' : undefined}
            aria-pressed={mode === 'advanced'}
            onClick={() => onModeChange('advanced')}
          >
            Advanced <span className="pro-dot" aria-hidden />
          </button>
        </div>
      </div>

      <div className="inspector-scroll">
        {advanced ? (
          <section className="recipe-bar">
            <div className="section-label-row">
              <span>Recipe</span>
              <button type="button" onClick={onSaveRecipe}>
                Save current
              </button>
            </div>
            <StudioSelect
              value={activeRecipeId}
              aria-label="Apply a recipe"
              onChange={(event) => onApplyRecipe(event.target.value)}
            >
              <option value="">Custom setup</option>
              <optgroup label="PoseForge recipes">
                <option value="builtin:studio-portrait">Studio portrait</option>
                <option value="builtin:golden-hour">Golden hour</option>
                <option value="builtin:family-lifestyle">Family lifestyle</option>
                <option value="builtin:editorial">Editorial</option>
                <option value="builtin:cinematic-story">Cinematic story</option>
                <option value="builtin:social-square">Social square</option>
                <option value="builtin:black-and-white">Black &amp; white</option>
                <option value="builtin:action">Action</option>
              </optgroup>
              {recipes.length ? (
                <optgroup label="Saved recipes">
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </StudioSelect>
          </section>
        ) : null}

        {/* ------------------------------------------ look & environment */}
        <ControlGroup title="Look & environment" defaultOpen>
          <div className="two-fields">
            <div>
              <StudioLabel htmlFor="backgroundPreset">Background</StudioLabel>
              <StudioSelect
                id="backgroundPreset"
                value={backgroundPresetId ?? ''}
                onChange={(event) =>
                  onPresetChange('background', event.target.value || null)
                }
              >
                <option value="">Original / auto</option>
                {backgrounds.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </StudioSelect>
            </div>
            <div>
              <StudioLabel htmlFor="stylePreset">Visual style</StudioLabel>
              <StudioSelect
                id="stylePreset"
                value={stylePresetId ?? ''}
                onChange={(event) => onPresetChange('style', event.target.value || null)}
              >
                <option value="">Photoreal</option>
                {styles.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </StudioSelect>
            </div>
          </div>

          <div>
            <StudioLabel htmlFor="instructions" aside={`${instructions.length} / 600`}>
              Creative brief
            </StudioLabel>
            <StudioTextarea
              id="instructions"
              maxLength={600}
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value)}
              placeholder="Describe wardrobe, mood, scene details, or anything the final image should communicate…"
            />
          </div>
        </ControlGroup>

        {advanced ? (
          <>
            {/* -------------------------------------- identity & pose */}
            <ControlGroup title="Identity & pose" defaultOpen>
              <RangeField
                id="identityFidelity"
                label="Identity fidelity"
                value={settings.identityFidelity}
                onChange={(value) => patch((c) => ({ ...c, identityFidelity: value }))}
                axis={['Interpret', 'Preserve']}
              />
              <RangeField
                id="poseFidelity"
                label="Pose adherence"
                value={settings.poseFidelity}
                onChange={(value) => patch((c) => ({ ...c, poseFidelity: value }))}
                axis={['Inspired', 'Exact']}
              />

              <div className="two-fields">
                <RangeField
                  id="ageFidelity"
                  label="Age fidelity"
                  value={settings.ageFidelity}
                  onChange={(value) => patch((c) => ({ ...c, ageFidelity: value }))}
                />
                <RangeField
                  id="hairFidelity"
                  label="Hair fidelity"
                  value={settings.hairFidelity}
                  onChange={(value) => patch((c) => ({ ...c, hairFidelity: value }))}
                />
              </div>

              <div className="toggle-list">
                <ToggleRow
                  id="preserveSkinTexture"
                  title="Natural skin texture"
                  description="Avoid plastic smoothing"
                  checked={settings.preserveSkinTexture}
                  onChange={(checked) =>
                    patch((c) => ({ ...c, preserveSkinTexture: checked }))
                  }
                />
                <ToggleRow
                  id="correctHands"
                  title="Anatomy guard"
                  description="Prioritize hands, eyes, and teeth"
                  checked={settings.correctHands}
                  onChange={(checked) => patch((c) => ({ ...c, correctHands: checked }))}
                />
              </div>

              <div className="subject-directions">
                {settings.subjects.map((subject, index) => {
                  const slot = slots[index];
                  return (
                    <div className="subject-direction" key={index}>
                      <div className="subject-direction-head">
                        {slot?.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- blob and local storage URLs
                          <img src={slot.previewUrl} alt="" />
                        ) : (
                          <span className="subject-direction-avatar">{index + 1}</span>
                        )}
                        <span>{slot?.name ?? `Person ${index + 1}`}</span>
                      </div>
                      <StudioInput
                        aria-label={`Direction for person ${index + 1}`}
                        maxLength={280}
                        placeholder="Wardrobe, placement, action…"
                        value={subject.direction}
                        onChange={(event) =>
                          patch((c) => ({
                            ...c,
                            subjects: c.subjects.map((item, i) =>
                              i === index ? { ...item, direction: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                      <StudioInput
                        aria-label={`Expression for person ${index + 1}`}
                        maxLength={100}
                        placeholder="Expression"
                        value={subject.expression}
                        onChange={(event) =>
                          patch((c) => ({
                            ...c,
                            subjects: c.subjects.map((item, i) =>
                              i === index ? { ...item, expression: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </ControlGroup>

            {/* ----------------------------------------- camera & light */}
            <ControlGroup title="Camera & light">
              <div className="two-fields">
                <SelectField
                  id="framing"
                  label="Framing"
                  value={settings.camera.framing}
                  options={FRAMING}
                  onChange={(value) =>
                    patch((c) => ({ ...c, camera: { ...c.camera, framing: value } }))
                  }
                />
                <SelectField
                  id="cameraAngle"
                  label="Angle"
                  value={settings.camera.angle}
                  options={ANGLE}
                  onChange={(value) =>
                    patch((c) => ({ ...c, camera: { ...c.camera, angle: value } }))
                  }
                />
                <SelectField
                  id="lens"
                  label="Lens feel"
                  value={settings.camera.lens}
                  options={LENS}
                  onChange={(value) =>
                    patch((c) => ({ ...c, camera: { ...c.camera, lens: value } }))
                  }
                />
                <SelectField
                  id="depthOfField"
                  label="Depth"
                  value={settings.camera.depthOfField}
                  options={DEPTH}
                  onChange={(value) =>
                    patch((c) => ({ ...c, camera: { ...c.camera, depthOfField: value } }))
                  }
                />
                <SelectField
                  id="aperture"
                  label="Aperture"
                  value={settings.camera.aperture}
                  options={APERTURE}
                  onChange={(value) =>
                    patch((c) => ({ ...c, camera: { ...c.camera, aperture: value } }))
                  }
                />
              </div>

              <div className="two-fields">
                <SelectField
                  id="lighting"
                  label="Lighting"
                  value={settings.lighting}
                  options={LIGHTING}
                  onChange={(value) => patch((c) => ({ ...c, lighting: value }))}
                />
                <SelectField
                  id="lightingTemperature"
                  label="Temperature"
                  value={settings.lightingTemperature}
                  options={TEMPERATURE}
                  onChange={(value) => patch((c) => ({ ...c, lightingTemperature: value }))}
                />
                <SelectField
                  id="timeOfDay"
                  label="Time of day"
                  value={settings.timeOfDay}
                  options={TIME_OF_DAY}
                  onChange={(value) => patch((c) => ({ ...c, timeOfDay: value }))}
                />
              </div>
            </ControlGroup>

            {/* ------------------------------------------- composition */}
            <ControlGroup title="Composition">
              <div className="two-fields">
                <SelectField
                  id="subjectSpacing"
                  label="Subject spacing"
                  value={settings.composition.spacing}
                  options={SPACING}
                  onChange={(value) =>
                    patch((c) => ({ ...c, composition: { ...c.composition, spacing: value } }))
                  }
                />
                <SelectField
                  id="cropSafety"
                  label="Crop behavior"
                  value={settings.composition.crop}
                  options={CROP}
                  onChange={(value) =>
                    patch((c) => ({ ...c, composition: { ...c.composition, crop: value } }))
                  }
                />
                <SelectField
                  id="backgroundSeparation"
                  label="Background separation"
                  value={settings.composition.backgroundSeparation}
                  options={SEPARATION}
                  onChange={(value) =>
                    patch((c) => ({
                      ...c,
                      composition: { ...c.composition, backgroundSeparation: value },
                    }))
                  }
                />
              </div>
              <div className="toggle-list">
                <ToggleRow
                  id="mirrorPose"
                  title="Mirror pose"
                  description="Flip the reference horizontally"
                  checked={settings.composition.mirrorPose}
                  onChange={(checked) =>
                    patch((c) => ({
                      ...c,
                      composition: { ...c.composition, mirrorPose: checked },
                    }))
                  }
                />
              </div>
            </ControlGroup>

            {/* -------------------------------------- finish & retouch */}
            <ControlGroup title="Finish & retouch">
              <div className="two-fields">
                <SelectField
                  id="retouch"
                  label="Retouch"
                  value={settings.finish.retouch}
                  options={RETOUCH}
                  onChange={(value) =>
                    patch((c) => ({ ...c, finish: { ...c.finish, retouch: value } }))
                  }
                />
                <SelectField
                  id="colorGrade"
                  label="Color grade"
                  value={settings.finish.colorGrade}
                  options={GRADE}
                  onChange={(value) =>
                    patch((c) => ({ ...c, finish: { ...c.finish, colorGrade: value } }))
                  }
                />
                <SelectField
                  id="grain"
                  label="Film grain"
                  value={settings.finish.grain}
                  options={GRAIN}
                  onChange={(value) =>
                    patch((c) => ({ ...c, finish: { ...c.finish, grain: value } }))
                  }
                />
              </div>
              <RangeField
                id="sharpness"
                label="Output sharpness"
                value={settings.finish.sharpness}
                onChange={(value) =>
                  patch((c) => ({ ...c, finish: { ...c.finish, sharpness: value } }))
                }
              />
            </ControlGroup>

            {/* ------------------------------------------------ output */}
            <ControlGroup title="Output">
              <div>
                <StudioLabel>Aspect ratio</StudioLabel>
                <div className="ratio-picker" role="group" aria-label="Aspect ratio">
                  {RATIOS.map(([ratio, label, shape]) => (
                    <button
                      key={ratio}
                      type="button"
                      aria-label={`${label} · ${ratio}`}
                      className={settings.output.aspectRatio === ratio ? 'active' : undefined}
                      aria-pressed={settings.output.aspectRatio === ratio}
                      onClick={() =>
                        patch((c) => ({ ...c, output: { ...c.output, aspectRatio: ratio } }))
                      }
                    >
                      <i className={shape} aria-hidden />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="two-fields">
                <SelectField
                  id="quality"
                  label="Quality"
                  value={settings.output.quality}
                  options={QUALITY}
                  onChange={(value) =>
                    patch((c) => ({ ...c, output: { ...c.output, quality: value } }))
                  }
                />
                <div>
                  <StudioLabel htmlFor="variantCount">Bulk outputs</StudioLabel>
                  <StudioSelect
                    id="variantCount"
                    value={String(settings.output.variantCount)}
                    onChange={(event) =>
                      patch((c) => ({
                        ...c,
                        output: { ...c.output, variantCount: Number(event.target.value) },
                      }))
                    }
                  >
                    {[1, 2, 3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>
                        {count} image{count === 1 ? '' : 's'}
                      </option>
                    ))}
                  </StudioSelect>
                </div>
              </div>

              <RangeField
                id="variationStrength"
                label="Variation strength"
                value={settings.output.variationStrength}
                onChange={(value) =>
                  patch((c) => ({ ...c, output: { ...c.output, variationStrength: value } }))
                }
                axis={['Consistent', 'Exploratory']}
              />

              <div>
                <StudioLabel htmlFor="seed" aside="Optional">
                  Seed
                </StudioLabel>
                <StudioInput
                  id="seed"
                  type="number"
                  min={0}
                  max={2147483647}
                  placeholder="Random"
                  value={settings.output.seed ?? ''}
                  onChange={(event) =>
                    patch((c) => ({
                      ...c,
                      output: {
                        ...c.output,
                        seed: event.target.value === '' ? null : Number(event.target.value),
                      },
                    }))
                  }
                />
              </div>

              <div>
                <StudioLabel htmlFor="negativePrompt">Avoid</StudioLabel>
                <StudioTextarea
                  id="negativePrompt"
                  maxLength={400}
                  value={settings.negativePrompt}
                  onChange={(event) => patch((c) => ({ ...c, negativePrompt: event.target.value }))}
                  placeholder="Artifacts, unwanted objects, visual traits…"
                />
              </div>

              {capabilityNote ? <p className="capability-note">{capabilityNote}</p> : null}

              <div className="usage-estimate">
                <span>Estimated usage</span>
                <strong>
                  {estimate
                    ? `${formatCompact(estimate.totalTokens)} tokens · ${
                        estimate.estimatedCostUsd == null
                          ? 'plan-dependent cost'
                          : formatCurrency(estimate.estimatedCostUsd)
                      }`
                    : 'Calculating…'}
                </strong>
                <small>
                  {estimate?.pricingNote ?? 'Rates and actual provider billing can vary.'}
                </small>
              </div>
            </ControlGroup>
          </>
        ) : null}
      </div>
    </aside>
  );
}
